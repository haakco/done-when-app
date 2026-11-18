//! Done When page links. Meeting links match the web app's `src/lib/links.ts`:
//! `/meet/<share token>` and `/edit/meet#<owner token>`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Counter,
    Project,
    Model,
    Meeting,
    Dashboard,
}

impl ItemKind {
    fn segment(self) -> &'static str {
        match self {
            ItemKind::Counter => "c",
            ItemKind::Project => "p",
            ItemKind::Model => "m",
            ItemKind::Meeting => "meet",
            ItemKind::Dashboard => "d",
        }
    }

    fn from_segment(segment: &str) -> Option<Self> {
        match segment {
            "c" => Some(ItemKind::Counter),
            "p" => Some(ItemKind::Project),
            "m" => Some(ItemKind::Model),
            "meet" => Some(ItemKind::Meeting),
            "d" => Some(ItemKind::Dashboard),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ItemKind::Counter => "counter",
            ItemKind::Project => "project",
            ItemKind::Model => "model",
            ItemKind::Meeting => "meeting",
            ItemKind::Dashboard => "dashboard",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Owner,
    Share,
}

/// The page an item's link opens.
pub fn item_url(host: &str, kind: ItemKind, access: Access, token: &str) -> String {
    let segment = kind.segment();
    match access {
        Access::Owner if kind == ItemKind::Meeting => format!("{host}/edit/{segment}#{token}"),
        Access::Owner => format!("{host}/edit/{segment}/{token}"),
        Access::Share => format!("{host}/{segment}/{token}"),
    }
}

/// The share-card image the delivery service renders for a share link (A5).
pub fn card_url(host: &str, kind: ItemKind, share_token: &str) -> Option<String> {
    if kind == ItemKind::Meeting {
        return None;
    }
    Some(format!(
        "{host}/.well-known/custd-card/{}/{share_token}.png",
        kind.segment()
    ))
}

/// A pasted share link, owner link or bare token. A token in the URL fragment is also read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkRef {
    pub kind: Option<ItemKind>,
    pub token: String,
}

pub fn parse_link(input: &str) -> Option<LinkRef> {
    let input = input.trim();
    if is_bare_token(input) {
        return Some(LinkRef {
            kind: None,
            token: input.to_owned(),
        });
    }
    let rest = input
        .strip_prefix("https://")
        .or_else(|| input.strip_prefix("http://"))?;
    let (_, path) = rest.split_once('/')?;
    let (path, fragment) = path.split_once('#').unwrap_or((path, ""));
    let path = path.strip_prefix("edit/").unwrap_or(path);
    let (segment, token) = path.split_once('/').unwrap_or((path, ""));
    let kind = ItemKind::from_segment(segment)?;
    let token = if token.is_empty() { fragment } else { token };
    is_bare_token(token).then(|| LinkRef {
        kind: Some(kind),
        token: token.to_owned(),
    })
}

fn is_bare_token(text: &str) -> bool {
    !text.is_empty()
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_meeting_share_and_owner_paths() {
        let host = "https://done-when.custd.dev";
        for (access, token, path) in [
            (Access::Share, "shr_1", "/meet/shr_1"),
            (Access::Owner, "own_1", "/edit/meet#own_1"),
        ] {
            let url = item_url(host, ItemKind::Meeting, access, token);
            assert_eq!(url, format!("{host}{path}"));
            assert_eq!(
                parse_link(&url),
                Some(LinkRef {
                    kind: Some(ItemKind::Meeting),
                    token: token.to_owned(),
                })
            );
        }
        assert_eq!(card_url(host, ItemKind::Meeting, "shr_1"), None);
    }

    #[test]
    fn reads_every_link_shape() {
        let host = "https://done-when.custd.dev";
        let owner = item_url(host, ItemKind::Counter, Access::Owner, "own_1");
        assert_eq!(owner, "https://done-when.custd.dev/edit/c/own_1");
        let want = Some(LinkRef {
            kind: Some(ItemKind::Counter),
            token: "own_1".to_owned(),
        });
        assert_eq!(parse_link(&owner), want);
        assert_eq!(parse_link(&format!("{host}/edit/c/#own_1")), want);
        assert_eq!(parse_link("shr-2").map(|l| l.kind), Some(None));
        assert_eq!(parse_link(&format!("{host}/x/abc")), None);
        assert_eq!(parse_link("two words"), None);
    }
}

//! Plain-text renderings of the operation reports; `--json` prints the same reports as JSON.

use serde::Serialize;

use crate::ops::{
    AddReport, CreatedReport, EntryReport, EstimateReport, ItemReport, ListReport, LoginReport,
    ShareReport, StatusReport,
};

pub trait Report: Serialize {
    fn text(&self) -> String;
}

impl Report for CreatedReport {
    fn text(&self) -> String {
        let mut text = format!(
            "Created {} {:?} ({})\nShare link: {}\nThe owner link is saved here; `done-when share {:?} --owner` prints it.",
            self.kind.label(),
            self.name,
            self.item_uuid,
            self.share_url,
            self.name
        );
        if self.start_measurement_added {
            text.push_str("\nStart value recorded.");
        }
        text
    }
}

impl Report for AddReport {
    fn text(&self) -> String {
        let mut text = format!("Added {} measurement(s)", self.accepted);
        if self.rejected > 0 {
            text.push_str(&format!(", {} rejected", self.rejected));
        }
        if self.target_reached {
            text.push_str(". Target reached!");
        }
        format!("{text}\n{}", self.forecast.sentence())
    }
}

impl Report for ItemReport {
    fn text(&self) -> String {
        let mut lines = vec![format!(
            "{} ({}, {}, {} link)",
            self.name,
            self.kind.label(),
            self.status,
            self.access
        )];
        if let Some(target) = self.target_value {
            let unit = self.unit.as_deref().unwrap_or("");
            lines.push(format!("Target: {target} {unit}").trim_end().to_owned());
        }
        if let Some(deadline) = &self.deadline {
            lines.push(format!("Deadline: {deadline}"));
        }
        match &self.forecast {
            Some(forecast) => lines.push(forecast.sentence()),
            None if self.kind == crate::links::ItemKind::Counter => {
                lines.push("No forecast yet.".to_owned())
            }
            None => {}
        }
        for estimate in &self.estimates {
            lines.push(format!(
                "Estimate {}: {} to {} {}",
                estimate
                    .estimated_at
                    .get(..10)
                    .unwrap_or(&estimate.estimated_at),
                estimate.low_date,
                estimate.high_date,
                estimate.note
            ));
        }
        for entry in &self.entries {
            lines.push(format!(
                "Entry {} → {} ({})",
                entry.entry_uuid, entry.item_uuid, entry.kind
            ));
        }
        lines.push(format!("Deleted if unchanged until {}", self.expires_at));
        lines.join("\n")
    }
}

impl Report for ListReport {
    fn text(&self) -> String {
        let mut lines = Vec::new();
        if self.signed_in {
            lines.push("Signed in. Showing items saved on this machine (\"my items\" is not in the SDK yet).".to_owned());
        }
        if self.items.is_empty() {
            lines.push("No items saved here. Start one with `done-when new counter`.".to_owned());
        }
        for item in &self.items {
            lines.push(format!(
                "{:<24} {:<9} {:<5} {}",
                item.name,
                item.kind.label(),
                item.access,
                item.share_url.as_deref().unwrap_or("-")
            ));
        }
        lines.join("\n")
    }
}

impl Report for ShareReport {
    fn text(&self) -> String {
        let mut lines = vec![match &self.share_url {
            Some(url) => format!("Share link (read-only): {url}"),
            None => "No share link is saved here for this item.".to_owned(),
        }];
        if let Some(url) = &self.owner_url {
            lines.push(format!("Owner link (can edit, keep private): {url}"));
        }
        lines.join("\n")
    }
}

impl Report for EstimateReport {
    fn text(&self) -> String {
        format!("Estimate recorded: {} to {}", self.low_date, self.high_date)
    }
}

impl Report for StatusReport {
    fn text(&self) -> String {
        format!("{} is now {}", self.item_uuid, self.status)
    }
}

impl Report for EntryReport {
    fn text(&self) -> String {
        format!(
            "Entry {} ({} {})",
            self.entry_uuid, self.kind, self.item_uuid
        )
    }
}

impl Report for LoginReport {
    fn text(&self) -> String {
        format!("Signed in to {} until {}", self.host, self.expires_at)
    }
}

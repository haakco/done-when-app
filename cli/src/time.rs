//! RFC 3339 times as Custd sends them, converted to and from Unix seconds without a date crate.

use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs() as i64)
}

pub fn now_rfc3339() -> String {
    format_rfc3339(now_seconds())
}

/// `2026-11-18T09:30:00Z`.
pub fn format_rfc3339(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let rest = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

/// `2026-11-18`.
pub fn format_date(seconds: i64) -> String {
    format_rfc3339(seconds)[..10].to_owned()
}

/// Parses `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM[:SS[.fff]](Z|±HH:MM)`.
pub fn parse_rfc3339(text: &str) -> Option<i64> {
    let text = text.trim();
    let bytes = text.as_bytes();
    if bytes.len() < 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let year = number(&text[0..4])?;
    let month = number(&text[5..7])?;
    let day = number(&text[8..10])?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let date = days_from_civil(year, month, day) * 86_400;
    if bytes.len() == 10 {
        return Some(date);
    }
    if !matches!(bytes[10], b'T' | b't' | b' ') {
        return None;
    }
    Some(date + time_of_day(&text[11..])?)
}

fn time_of_day(text: &str) -> Option<i64> {
    let zone_at = text.find(['Z', 'z', '+', '-']).unwrap_or(text.len());
    let (clock, zone) = text.split_at(zone_at);
    let mut parts = clock.split(':');
    let hour = number(parts.next()?)?;
    let minute = number(parts.next()?)?;
    let second = match parts.next() {
        Some(seconds) => number(seconds.split('.').next()?)?,
        None => 0,
    };
    if parts.next().is_some() || hour > 23 || minute > 59 || second > 60 {
        return None;
    }
    Some(hour * 3600 + minute * 60 + second - zone_offset(zone)?)
}

fn zone_offset(zone: &str) -> Option<i64> {
    match zone {
        "" | "Z" | "z" => Some(0),
        _ => {
            let sign = if zone.starts_with('-') { -1 } else { 1 };
            let (hours, minutes) = zone[1..].split_once(':')?;
            Some(sign * (number(hours)? * 3600 + number(minutes)? * 60))
        }
    }
}

fn number(text: &str) -> Option<i64> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

// Howard Hinnant's civil-date algorithms.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month_index = (month + 9) % 12;
    let day_of_year = (153 * month_index + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let days = days + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_reads_offsets() {
        let at = parse_rfc3339("2026-11-18T09:30:15Z").unwrap();
        assert_eq!(format_rfc3339(at), "2026-11-18T09:30:15Z");
        assert_eq!(parse_rfc3339("2026-11-18T11:30:15.250+02:00"), Some(at));
        assert_eq!(
            parse_rfc3339("2026-11-18"),
            Some(at - 9 * 3600 - 30 * 60 - 15)
        );
        assert_eq!(
            parse_rfc3339("2024-02-29T00:00:00Z").map(format_date),
            Some("2024-02-29".to_owned())
        );
        assert_eq!(parse_rfc3339("not a date"), None);
        assert_eq!(parse_rfc3339("2026-13-01"), None);
    }
}

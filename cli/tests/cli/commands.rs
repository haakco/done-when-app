use serde_json::Value;

use crate::support::{FakeApi, run, temp_config_dir};

#[test]
fn counter_journey_keeps_the_owner_link_private() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    let base = api.base_url.as_str();

    let new = [
        "new", "counter", "--name", "Pages", "--target", "100", "--unit", "pages", "--start", "3",
    ];
    let (code, out, err) = run(base, &dir, &[&new[..], &["--json"]].concat(), "");
    assert_eq!(code, 0, "{err}");
    let created: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(created["shareUrl"], format!("{base}/c/shr-0"));
    assert_eq!(created["startMeasurementAdded"], true);
    assert!(!out.contains("own-0"));
    let create = &api.requests()[1];
    assert_eq!(create.header("x-custd-site-key"), Some("site_pk_test"));
    assert_eq!(create.header("origin"), Some(base));

    let store = std::fs::read_to_string(dir.join("store.json")).unwrap();
    assert!(store.contains("own-0"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.join("store.json"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    let (code, out, err) = run(base, &dir, &["add", "Pages", "40"], "");
    assert_eq!(code, 0, "{err}");
    assert!(out.contains("Added 1 measurement"), "{out}");
    assert!(out.contains("50% chance by the deadline"), "{out}");
    let (_, out, _) = run(base, &dir, &["show", "Pages"], "");
    assert!(out.contains("Target: 100 pages"), "{out}");

    let (code, out, _) = run(
        base,
        &dir,
        &["show", &format!("{base}/c/shr-0"), "--json"],
        "",
    );
    assert_eq!(code, 0);
    let shown: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(shown["access"], "share");
    assert_eq!(shown["forecast"]["deadlineProbability"], 0.5);

    let (_, out, _) = run(base, &dir, &["list", "--json"], "");
    let listed: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(listed["items"][0]["name"], "Pages");
    assert_eq!(listed["items"][0]["access"], "owner");
    assert!(!out.contains("own-0"));

    let (_, out, _) = run(base, &dir, &["share", "Pages"], "");
    assert!(out.contains("/c/shr-0") && !out.contains("own-0"), "{out}");
    let (_, out, _) = run(base, &dir, &["share", "Pages", "--owner"], "");
    assert!(out.contains(&format!("{base}/edit/c/own-0")), "{out}");
}

#[test]
fn a_share_link_cannot_write() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    let base = api.base_url.as_str();
    run(
        base,
        &dir,
        &["new", "counter", "--name", "Laps", "--target", "100"],
        "",
    );

    let share = format!("{base}/c/shr-0");
    let (code, _, err) = run(base, &dir, &["add", &share, "4"], "");
    assert_eq!(code, 1);
    assert!(err.contains("read-only share link"), "{err}");
    let (code, _, _) = run(base, &dir, &["complete", "shr-0"], "");
    assert_eq!(code, 1);
    let viewer = temp_config_dir();
    let (code, _, err) = run(base, &viewer, &["share", &share, "--owner"], "");
    assert_eq!((code, err.contains("read-only")), (1, true));
    let (code, _, err) = run(base, &viewer, &["add", &share, "5"], "");
    assert_eq!((code, err.contains("read-only")), (1, true), "{err}");
    assert_eq!(api.count("POST", "/api/v1/app/item/measurements"), 0);
    assert_eq!(api.count("POST", "/api/v1/app/item/complete"), 0);
}

#[test]
fn csv_import_estimate_and_dashboard() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    let base = api.base_url.as_str();
    run(
        base,
        &dir,
        &["new", "counter", "--name", "Km", "--target", "100"],
        "",
    );

    let csv = dir.join("km.csv");
    std::fs::write(
        &csv,
        "timestamp,value\n2026-11-01T00:00:00Z,1\n2026-11-02,4\n",
    )
    .unwrap();
    let (code, out, err) = run(
        base,
        &dir,
        &["add", "Km", "--csv", csv.to_str().unwrap(), "--json"],
        "",
    );
    assert_eq!(code, 0, "{err}");
    assert_eq!(serde_json::from_str::<Value>(&out).unwrap()["accepted"], 2);
    let requests = api.requests();
    let measurements = requests
        .iter()
        .rev()
        .find(|r| r.target.ends_with("/measurements"))
        .unwrap();
    let sent: Value = serde_json::from_str(&measurements.body).unwrap();
    assert_eq!(sent["rows"][1]["observedAt"], "2026-11-02T00:00:00Z");
    assert_eq!(sent["rows"][1]["seriesUuid"], "series-1");

    let (code, out, err) = run(
        base,
        &dir,
        &[
            "estimate",
            "Km",
            "--low",
            "2026-12-01",
            "--high",
            "2026-12-20",
        ],
        "",
    );
    assert_eq!(code, 0, "{err}");
    assert!(out.contains("2026-12-01T00:00:00Z"), "{out}");

    let (code, _, err) = run(base, &dir, &["dashboard", "create", "--name", "Board"], "");
    assert_eq!(code, 0, "{err}");
    let (code, out, _) = run(
        base,
        &dir,
        &["dashboard", "add", "Board", "Km", "--json"],
        "",
    );
    assert_eq!(code, 0);
    let entry: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(entry["itemUuid"], "item-0");
    let added = api
        .requests()
        .into_iter()
        .find(|r| r.target.ends_with("/entries"))
        .unwrap();
    assert_eq!(added.body, r#"{"token":"shr-0"}"#);
    let (code, _, _) = run(base, &dir, &["dashboard", "remove", "Board", "item-0"], "");
    assert_eq!(code, 0);
    let (_, out, _) = run(base, &dir, &["show", "Board", "--json"], "");
    assert_eq!(
        serde_json::from_str::<Value>(&out).unwrap()["entries"],
        Value::Array(vec![])
    );
}

#[test]
fn login_saves_the_session_without_printing_it() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    let cli = <done_when::cli::Cli as clap::Parser>::try_parse_from([
        "done-when",
        "--host",
        &api.base_url,
        "login",
    ])
    .unwrap();
    let mut ctx = done_when::context::Context::new(&api.base_url, dir.to_path_buf());
    ctx.login_runner = |login, _| {
        assert_eq!(
            (login.client_id.as_str(), login.audience.as_deref()),
            ("done-when", Some("custd"))
        );
        Ok(custd_sdk::DeviceToken {
            access_token: "user-token-1".to_owned(),
            refresh_token: None,
            expires_in: std::time::Duration::from_secs(3600),
        })
    };
    let (mut out, mut err) = (Vec::new(), Vec::new());
    done_when::cli::dispatch(
        &ctx,
        cli.command,
        false,
        &mut "".as_bytes(),
        &mut out,
        &mut err,
    )
    .unwrap();
    let out = String::from_utf8(out).unwrap();
    assert!(
        out.starts_with("Signed in to") && !out.contains("user-token-1"),
        "{out}"
    );
    assert!(
        std::fs::read_to_string(dir.join("store.json"))
            .unwrap()
            .contains("user-token-1")
    );
    let (_, out, _) = run(&api.base_url, &dir, &["list", "--json"], "");
    assert_eq!(
        serde_json::from_str::<Value>(&out).unwrap()["signedIn"],
        true
    );
}

#[test]
fn a_failed_forecast_says_the_measurement_was_stored() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    run(
        &api.base_url,
        &dir,
        &["new", "counter", "--name", "Flaky", "--target", "10"],
        "",
    );
    let (code, _, err) = run(&api.base_url, &dir, &["add", "Flaky", "2"], "");
    assert_eq!(code, 1);
    assert!(
        err.contains("1 measurement(s) were stored") && err.contains("do not add them again"),
        "{err}"
    );
}

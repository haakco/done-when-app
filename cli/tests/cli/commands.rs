use serde_json::Value;

use crate::support::{FakeApi, USER_TOKEN, run, sign_in, temp_config_dir};

const NEVER: i64 = 4_102_444_800;

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

    let (_, sparse, _) = run(base, &dir, &["add", "Pages", "20"], "");
    assert!(!sparse.contains("chance by the deadline"), "{sparse}");
    let (code, out, err) = run(base, &dir, &["add", "Pages", "40"], "");
    assert_eq!(code, 0, "{err}");
    assert!(out.contains("Added 1 measurement"), "{out}");
    assert!(out.contains("75% chance by the deadline"), "{out}");
    assert!(out.contains("median 2026-12-02"), "{out}");
    let (code, _, err) = run(base, &dir, &["add", "Pages", "55"], "");
    assert_eq!(code, 0, "{err}");
    let request = api
        .requests()
        .into_iter()
        .rfind(|request| request.method == "POST" && request.target == "/api/v1/app/forecast/runs")
        .unwrap();
    let settings: Value = serde_json::from_str(&request.body).unwrap();
    assert_eq!(settings["method"], "bayesian_linear_regression");
    assert_eq!(settings["forecastFrom"], "2026-11-15T00:00:00Z");
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
    assert_eq!(shown["forecast"]["deadlineProbability"], 0.95);

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
            "-",
            "--low",
            "2026-12-01",
            "--high",
            "2026-12-20",
            "--at",
            "2026-11-01",
            "--json",
        ],
        &format!("{base}/edit/p#own-0\n"),
    );
    assert_eq!(code, 0, "{err}");
    assert!(!out.contains("own-0"));
    let estimate: Value = serde_json::from_str(&out).unwrap();
    let (code, out, err) = run(
        base,
        &dir,
        &["remember", "--json"],
        &format!("{base}/edit/p#own-0\n"),
    );
    assert_eq!(code, 0, "{err}");
    assert!(!out.contains("own-0"));
    assert_eq!(estimate["lowDate"], "2026-12-01T00:00:00Z");
    assert_eq!(estimate["estimatedAt"], "2026-11-01T00:00:00Z");

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
    ctx.login_runner = |login, scopes, _| {
        assert!(!scopes.is_empty());
        assert_eq!(
            (login.client_id.as_str(), login.audience.as_str()),
            ("done-when", "custd")
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
    run(&api.base_url, &dir, &["add", "Flaky", "1"], "");
    run(&api.base_url, &dir, &["add", "Flaky", "2"], "");
    let (code, out, err) = run(&api.base_url, &dir, &["add", "Flaky", "3", "--json"], "");
    let report: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(report["accepted"], 1);
    assert!(report["forecastError"].is_string());
    assert_eq!(code, 1);
    assert!(
        err.contains("1 measurement(s) were stored")
            && err.contains("do not add accepted measurements again"),
        "{err}"
    );
}

#[test]
fn a_signed_in_user_lists_claims_and_reaches_their_items() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    let base = api.base_url.as_str();
    let (code, _, err) = run(base, &dir, &["claim", "own-0"], "");
    assert_eq!((code, err.contains("sign in first")), (1, true), "{err}");

    api.add_project("Launch", Some(USER_TOKEN));
    sign_in(base, &dir, NEVER);
    run(
        base,
        &dir,
        &["new", "counter", "--name", "Pages", "--target", "100"],
        "",
    );
    let create = api
        .requests()
        .into_iter()
        .find(|r| r.method == "POST" && r.target == "/api/v1/app/items")
        .unwrap();
    assert_eq!(create.header("x-custd-user-token"), Some(USER_TOKEN));

    let (code, out, err) = run(base, &dir, &["list", "--json"], "");
    assert_eq!(code, 0, "{err}");
    let listed: Value = serde_json::from_str(&out).unwrap();
    let items = listed["items"].as_array().unwrap();
    assert_eq!(items.len(), 2, "{out}");
    assert_eq!(
        (&items[0]["name"], &items[0]["mine"], &items[0]["savedHere"]),
        (
            &Value::from("Pages"),
            &Value::from(true),
            &Value::from(true)
        )
    );
    assert_eq!(
        (&items[1]["name"], &items[1]["kind"], &items[1]["savedHere"]),
        (&Value::from("Launch"), &Value::Null, &Value::from(false))
    );

    let (code, out, err) = run(base, &dir, &["show", "Launch", "--json"], "");
    assert_eq!(code, 0, "{err}");
    let shown: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(
        (&shown["kind"], &shown["access"]),
        (&"project".into(), &"owner".into())
    );
    let read = api
        .requests()
        .into_iter()
        .rfind(|r| r.target.starts_with("/api/v1/app/item?"))
        .unwrap();
    assert_eq!(
        (read.target.as_str(), read.header("authorization")),
        ("/api/v1/app/item?item=item-0", None)
    );

    api.add_project("Shared", None);
    let (code, out, err) = run(
        base,
        &dir,
        &["claim", &format!("{base}/edit/c/own-2"), "--json"],
        "",
    );
    assert_eq!(code, 0, "{err}");
    let claimed: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(
        (&claimed["kind"], &claimed["ownership"]),
        (&"project".into(), &"yours".into()),
        "the series code wins over the /c/ path"
    );
    let (_, out, _) = run(base, &dir, &["list", "--json"], "");
    assert!(
        out.contains("\"Shared\"") && !out.contains("own-2"),
        "{out}"
    );

    api.add_project("Taken", Some("someone-else"));
    let (code, _, err) = run(base, &dir, &["claim", "own-3"], "");
    assert_eq!((code, err.contains("someone else")), (1, true), "{err}");
}

#[test]
fn an_expired_session_is_not_sent() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    sign_in(&api.base_url, &dir, 1);
    let (code, _, err) = run(
        &api.base_url,
        &dir,
        &["new", "counter", "--name", "Laps", "--target", "10"],
        "",
    );
    assert_eq!(code, 0, "{err}");
    assert!(
        api.requests()
            .iter()
            .all(|r| r.header("x-custd-user-token").is_none())
    );
    let (_, out, _) = run(&api.base_url, &dir, &["list", "--json"], "");
    assert_eq!(
        serde_json::from_str::<Value>(&out).unwrap()["signedIn"],
        false
    );
}

#[test]
fn a_keyed_measurement_replays_and_a_partial_import_reports_rejected_rows() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    let base = &api.base_url;
    assert_eq!(
        run(
            base,
            &dir,
            &["new", "counter", "--name", "Partial", "--target", "10"],
            ""
        )
        .0,
        0
    );
    let fixed = [
        "add",
        "Partial",
        "2",
        "--at",
        "2026-11-01",
        "--idempotency-key",
        "batch-1",
        "--json",
    ];
    let (first_code, first, _) = run(base, &dir, &fixed, "");
    let (second_code, second, _) = run(base, &dir, &fixed, "");
    assert_eq!((first_code, second_code), (0, 0));
    let first: Value = serde_json::from_str(&first).unwrap();
    let second: Value = serde_json::from_str(&second).unwrap();
    assert_eq!(
        first["rows"][0]["observationUuid"],
        second["rows"][0]["observationUuid"]
    );
    assert_eq!(api.count("POST", "/api/v1/app/forecast/runs"), 0);
    let requests = api.requests();
    let sent: Value = serde_json::from_str(
        &requests
            .iter()
            .rev()
            .find(|r| r.method == "POST")
            .unwrap()
            .body,
    )
    .unwrap();
    assert_eq!(sent["rows"][0]["idempotencyKey"], "batch-1");

    let csv = dir.join("partial.csv");
    std::fs::write(&csv, "timestamp,value\n2026-11-02,1\n2026-11-03,-1\n").unwrap();
    let (code, out, err) = run(
        base,
        &dir,
        &["add", "Partial", "--csv", csv.to_str().unwrap(), "--json"],
        "",
    );
    assert_eq!(code, 1, "{err}");
    let result: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(result["accepted"], 1);
    assert_eq!(result["rejected"], 1);
    assert_eq!(result["rows"][1]["success"], false);
    assert_eq!(
        api.count("POST", "/api/v1/app/forecast/runs"),
        0,
        "the replay does not add to the measurement count"
    );
    assert!(done_when::ops::parse_csv("bad date,1\n2026-11-01,1").is_err());
}

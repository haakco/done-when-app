use std::io::Cursor;
use std::time::Duration;

use done_when::context::Context;
use done_when::ops::{Reach, Resolved};
use done_when::watch::{Poller, WatchModel, card_protocol, render};
use ratatui::Terminal;
use ratatui::backend::TestBackend;
use ratatui_image::picker::{Picker, ProtocolType};

use crate::support::{FakeApi, run, temp_config_dir};

fn screen(terminal: &Terminal<TestBackend>) -> String {
    let buffer = terminal.backend().buffer();
    let width = buffer.area.width as usize;
    let symbols: Vec<&str> = buffer.content.iter().map(|cell| cell.symbol()).collect();
    symbols
        .chunks(width)
        .map(|row| row.concat())
        .collect::<Vec<_>>()
        .join("\n")
}

fn card_png() -> Vec<u8> {
    let image = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
        120,
        63,
        image::Rgb([20, 120, 140]),
    ));
    let mut png = Cursor::new(Vec::new());
    image.write_to(&mut png, image::ImageFormat::Png).unwrap();
    png.into_inner()
}

#[test]
fn watch_polls_conditionally_and_renders_with_and_without_an_image() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    run(
        &api.base_url,
        &dir,
        &[
            "new", "counter", "--name", "Pages", "--target", "100", "--start", "3",
        ],
        "",
    );
    run(&api.base_url, &dir, &["add", "Pages", "40"], "");

    let ctx = Context::new(&api.base_url, dir.to_path_buf());
    let mut model = WatchModel {
        card_url: Some(format!("{}/card.png", api.base_url)),
        ..WatchModel::default()
    };
    let item = Resolved {
        reach: Reach::Link("own-0".to_owned()),
        stored: None,
    };
    let mut poller = Poller::new(Duration::from_secs(5));
    poller.poll(&ctx, &item, &mut model);
    poller.poll(&ctx, &item, &mut model);
    assert!(model.status.starts_with("Updated"), "{}", model.status);
    for path in ["/api/v1/app/item", "/api/v1/app/forecast/story"] {
        let last = api
            .requests()
            .into_iter()
            .rfind(|r| r.target == path)
            .unwrap();
        assert!(
            last.header("if-none-match").is_some(),
            "second poll of {path} is conditional"
        );
    }
    assert_eq!(model.measurements.len(), 2, "history comes from the story");

    let mut terminal = Terminal::new(TestBackend::new(100, 30)).unwrap();
    terminal.draw(|frame| render(frame, &model, None)).unwrap();
    let text = screen(&terminal);
    for want in [
        "Pages",
        "Forecast",
        "50% by 2026-12-01",
        "cannot show images",
        "Measurements",
        "40",
    ] {
        assert!(text.contains(want), "missing {want:?} in\n{text}");
    }

    let mut picker = Picker::halfblocks();
    picker.set_protocol_type(ProtocolType::Kitty);
    let mut card = card_protocol(&picker, &card_png()).expect("a PNG card decodes");
    terminal
        .draw(|frame| render(frame, &model, Some(&mut card)))
        .unwrap();
    let text = screen(&terminal);
    assert!(!text.contains("cannot show images"), "{text}");
    assert!(text.contains("Share card") && text.contains("Forecast"));
}

use raster_style::{canonical_json, decode_query, encode_query, Codec, Options, Style};
use serde_json::Value;

fn fixtures(name: &str) -> Vec<Value> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata")
        .join(format!("{name}.json"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}
#[test]
fn golden_fixtures() {
    for fixture in fixtures("roundtrip") {
        let name = fixture["name"].as_str().unwrap();
        let style = Style::from_json(&fixture["raster_style"].to_string()).unwrap();
        let query = encode_query(&style).unwrap();
        assert_eq!(query, fixture["query"].as_str().unwrap(), "{name}");
        assert_eq!(
            decode_query(&format!("?{query}"))
                .unwrap()
                .to_json()
                .unwrap(),
            style.to_json().unwrap(),
            "{name}"
        );
    }
}
#[test]
fn invalid_queries() {
    for fixture in fixtures("invalid-queries") {
        let error = decode_query(fixture["query"].as_str().unwrap()).unwrap_err();
        assert_eq!(
            error.code,
            fixture["code"].as_str().unwrap(),
            "{}",
            fixture["name"]
        );
    }
}
#[test]
fn invalid_styles() {
    for fixture in fixtures("invalid-styles") {
        let error = Style::from_json(fixture["json"].as_str().unwrap()).unwrap_err();
        assert_eq!(
            error.code,
            fixture["code"].as_str().unwrap(),
            "{}",
            fixture["name"]
        );
    }
}
#[test]
fn canonical_vectors() {
    for fixture in fixtures("canonical") {
        let actual = canonical_json(fixture["json"].as_str().unwrap()).unwrap();
        assert_eq!(
            actual,
            fixture["canonical"].as_str().unwrap(),
            "{}",
            fixture["name"]
        );
    }
}
#[test]
fn invalid_json() {
    for fixture in fixtures("invalid-json") {
        let error = canonical_json(fixture["json"].as_str().unwrap()).unwrap_err();
        assert_eq!(
            error.code,
            fixture["code"].as_str().unwrap(),
            "{}",
            fixture["name"]
        );
    }
}
#[test]
fn budgets_and_serde() {
    let codec = Codec::new(Options {
        max_query_bytes: 8,
        ..Options::default()
    })
    .unwrap();
    assert_eq!(
        codec
            .decode_query("version=2.0&type=gray")
            .unwrap_err()
            .code,
        "E_LIMIT"
    );
    assert_eq!(
        canonical_json(&" ".repeat(2 * 1024 * 1024 + 1))
            .unwrap_err()
            .code,
        "E_LIMIT"
    );
    let fixture = &fixtures("roundtrip")[0];
    let style: Style = serde_json::from_str(&fixture["raster_style"].to_string()).unwrap();
    assert_eq!(
        encode_query(&style).unwrap(),
        fixture["query"].as_str().unwrap()
    );
    assert!(serde_json::from_str::<Style>(r#"{"version":"2.0","version":"2.0"}"#).is_err());
}
#[test]
fn parallel_roundtrip() {
    let query = fixtures("roundtrip")[0]["query"]
        .as_str()
        .unwrap()
        .to_owned();
    let workers: Vec<_> = (0..8)
        .map(|_| {
            let query = query.clone();
            std::thread::spawn(move || {
                for _ in 0..10 {
                    assert_eq!(encode_query(&decode_query(&query).unwrap()).unwrap(), query);
                }
            })
        })
        .collect();
    for worker in workers {
        worker.join().unwrap();
    }
}

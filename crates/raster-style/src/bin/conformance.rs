use raster_style::{decode_query, encode_query, Style};
use serde_json::{json, Value};
use std::io::{self, BufRead};

fn run(request: &Value) -> raster_style::Result<Value> {
    let style = match request["op"].as_str() {
        Some("encode") => Style::from_json(request["json"].as_str().unwrap_or_default())?,
        Some("decode") => decode_query(request["query"].as_str().unwrap_or_default())?,
        _ => return Ok(json!({"error":"E_CONFIG"})),
    };
    Ok(json!({"query":encode_query(&style)?,"json":style.to_json()?}))
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    for line in io::stdin().lock().lines() {
        let line = line?;
        let result = match serde_json::from_str::<Value>(&line) {
            Ok(request) => run(&request).unwrap_or_else(|error| json!({"error":error.code})),
            Err(_) => json!({"error":"E_JSON"}),
        };
        println!("{result}");
    }
    Ok(())
}

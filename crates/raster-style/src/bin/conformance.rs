use raster_style::{decode_query, encode_query, SchemaRegistry, Style};
use serde_json::{json, Value};
use std::io::{self, BufRead};

fn run(request: &Value) -> raster_style::Result<Value> {
    if matches!(
        request["op"].as_str(),
        Some("inspect" | "validate" | "support")
    ) {
        let mut registry = SchemaRegistry::new()?;
        if let Some(schemas) = request["schemas"].as_array() {
            for schema in schemas {
                registry.register(schema.clone())?;
            }
        }
        let text = request["json"].as_str().unwrap_or_default();
        let style = registry.parse_json(text)?;
        if request["op"] == "validate" {
            registry.validate_json(text)?;
        }
        if request["op"] == "support" {
            let supported: Vec<&str> = request["supported"]
                .as_array()
                .map(|values| values.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            style.require_extension_support(&supported)?;
        }
        return Ok(json!(style.validation()));
    }
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

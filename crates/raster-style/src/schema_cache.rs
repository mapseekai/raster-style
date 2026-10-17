use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, OnceLock};

use jsonschema::Validator;

use crate::error::Result;

type CompilationSlot = Arc<OnceLock<Result<Arc<Validator>>>>;

/// Bounded LRU metadata. A caller releases its mutex before compiling a slot;
/// OnceLock coalesces simultaneous requests for the same combination.
#[derive(Default)]
pub(crate) struct SchemaCache {
    entries: HashMap<String, CompilationSlot>,
    order: VecDeque<String>,
}

impl SchemaCache {
    pub(crate) fn slot(&mut self, key: String) -> CompilationSlot {
        if let Some(entry) = self.entries.get(&key) {
            let slot = Arc::clone(entry);
            self.order.retain(|existing| existing != &key);
            self.order.push_back(key);
            return slot;
        }
        if self.entries.len() >= 64 {
            if let Some(oldest) = self.order.pop_front() {
                self.entries.remove(&oldest);
            }
        }
        let slot = Arc::new(OnceLock::new());
        self.entries.insert(key.clone(), Arc::clone(&slot));
        self.order.push_back(key);
        slot
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.entries.len()
    }

    pub(crate) fn clear(&mut self) {
        self.entries.clear();
        self.order.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Barrier, Mutex};

    #[test]
    fn lru_retains_hot_entries_and_evicts_one_cold_entry() {
        let mut cache = SchemaCache::default();
        let hot = cache.slot("hot".into());
        let cold = cache.slot("cold".into());
        for index in 0..80 {
            assert!(Arc::ptr_eq(&hot, &cache.slot("hot".into())));
            cache.slot(format!("key-{index}"));
            assert!(cache.entries.len() <= 64);
            assert_eq!(cache.entries.len(), cache.order.len());
        }
        assert!(!Arc::ptr_eq(&cold, &cache.slot("cold".into())));
        assert!(Arc::ptr_eq(&hot, &cache.slot("hot".into())));
    }

    #[test]
    fn same_key_compiles_once_without_holding_cache_mutex() {
        let cache = Mutex::new(SchemaCache::default());
        let barrier = Barrier::new(12);
        let compiled = AtomicUsize::new(0);
        std::thread::scope(|scope| {
            for _ in 0..12 {
                scope.spawn(|| {
                    barrier.wait();
                    let slot = cache.lock().unwrap().slot("shared".into());
                    slot.get_or_init(|| {
                        let _cache = cache.lock().unwrap();
                        compiled.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(
                            jsonschema::validator_for(&serde_json::json!({"type":"number"}))
                                .unwrap(),
                        ))
                    })
                    .as_ref()
                    .unwrap();
                });
            }
        });
        assert_eq!(compiled.load(Ordering::SeqCst), 1);
    }
}

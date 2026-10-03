//! Bounded native reads matching the backend's default format policy.
//! The backend may apply a stricter administrator-configured limit.

pub fn import_limit(extension: &str) -> u64 {
    let mib = match extension {
        "ifc" => 512,
        "pdf" => 128,
        _ => 25,
    };
    mib * 1024 * 1024
}

#[cfg(test)]
mod tests {
    use super::import_limit;

    #[test]
    fn engineering_formats_have_bounded_independent_limits() {
        assert_eq!(import_limit("ifc"), 512 * 1024 * 1024);
        assert_eq!(import_limit("pdf"), 128 * 1024 * 1024);
        assert_eq!(import_limit("txt"), 25 * 1024 * 1024);
        assert_eq!(import_limit("unknown"), 25 * 1024 * 1024);
    }
}

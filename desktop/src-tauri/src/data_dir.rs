use std::{ffi::OsString, path::PathBuf};

/// A trusted launcher can select isolated desktop storage; never a renderer path.
/// Deliberately distinct from CCA_DATA_DIR inherited by development Python shells.
pub fn resolve(default: PathBuf, selected: Option<OsString>) -> Result<PathBuf, String> {
    match selected {
        None => Ok(default),
        Some(value) => {
            let path = PathBuf::from(value);
            if !path.is_absolute() {
                return Err("CCA_DESKTOP_DATA_DIR must be an absolute directory.".into());
            }
            Ok(path)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::resolve;

    #[test]
    fn default_and_explicit_desktop_storage_are_distinct() {
        let default = std::env::temp_dir().join("concord-default");
        let isolated = std::env::temp_dir().join("concord-isolated");
        assert_eq!(resolve(default.clone(), None).unwrap(), default);
        assert_eq!(
            resolve(default, Some(isolated.clone().into_os_string())).unwrap(),
            isolated
        );
    }

    #[test]
    fn relative_and_empty_overrides_fail_closed() {
        for path in ["", "relative/data", "../other"] {
            assert!(resolve(std::env::temp_dir(), Some(path.into())).is_err());
        }
    }
}

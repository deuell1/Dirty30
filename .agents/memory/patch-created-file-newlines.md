---
name: Patch-created file newlines
description: How to handle missing final newlines in files created with the workspace patch tool.
---

Files created with the patch tool can retain a missing-final-newline marker. An update aimed only at a common closing brace may match an earlier brace instead of the actual end of the file.

**Why:** Repeated content-only edits did not clear Prettier’s missing-final-newline warning, and an ambiguously anchored blank-line patch landed earlier in the file.

**How to apply:** When Prettier reports only a missing final newline, anchor the patch with several unique lines from the file’s final block and add an explicit empty line after the final content line.
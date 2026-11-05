# Legacy dashboard preview archive

These are synthetic preview fixtures removed from the active dashboard on 2026-11-03. They are preserved byte-for-byte for reference and are not imported by the application. They are not a backup of a production semester database.

Full pre-change source history and the local backend database were also saved in the workspace `archives/2026-11-03-semester-rollover` directory, with SHA-256 checksums and a verified SQLite backup. The local database held two sample teams and zero events.

The active dashboard now starts empty and reads the API on its own origin (or `VITE_API_URL` when explicitly set). There is no automatic demo fallback or seed endpoint.

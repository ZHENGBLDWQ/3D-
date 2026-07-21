# Bambu Studio slicing runner

The website only queues a versioned `SlicingRequest`. The Local Hub claims the job, downloads the organization-scoped R2 input through an authenticated gateway endpoint, materializes immutable profile snapshots as JSON, and invokes Bambu Studio locally.

The adapter always calls `spawn(executable, args, { shell: false })`. Paths and settings are never concatenated into a shell command. Inputs are restricted to absolute `.stl`/`.3mf` paths and outputs to an absolute `.3mf` path.

Production integration still needs gateway claim/result/upload endpoints. The runner contract already represents cancellation, timeout, failure and output metadata, but this first delivery deliberately does not execute desktop software inside Cloudflare Workers.

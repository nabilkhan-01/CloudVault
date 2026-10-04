# CloudVault

CloudVault is a small academic demonstration of private cloud file storage using Amazon S3 and the AWS SDK for JavaScript v3. An Express server handles a local demo login and performs S3 uploads, listing, deletion, and temporary download URL generation. AWS credentials stay on the server and are resolved by the AWS SDK default credential provider chain.

## What it demonstrates

- Private S3 storage with IAM permissions scoped to one bucket and the `uploads/` object prefix
- SSE-S3 encryption requested on each upload
- Presigned download URLs that expire after five minutes
- Server-side AWS credentials and environment-based configuration
- Basic session-based application login

This is an educational single-user demo, not a production file service. Its login is shared by anyone with the configured application credentials, and its default in-memory session store is intended for local demonstration only.

## Prerequisites

- Node.js 20 or newer (npm is included)
- An AWS account and an S3 bucket you control
- AWS credentials configured using the AWS SDK default credential provider chain (for example, an AWS CLI profile, environment credentials, or an attached IAM role)

The AWS CLI is optional; install it only if you want to use `aws configure` or the AWS CLI commands below.

## Setup from a fresh clone

Clone the repository and install the locked dependencies:

```sh
git clone <repository-url>
cd cloudvault
npm ci
```

Create an S3 bucket in the AWS Region you plan to use. Keep S3 Block Public Access enabled, use Bucket owner enforced object ownership, and enable default encryption. Do not add a public bucket policy. Bucket names are globally unique, so choose your own.

Create an IAM identity for this application. Attach a policy based on [`docs/IAM-POLICY-TEMPLATE.json`](docs/IAM-POLICY-TEMPLATE.json), replacing both `REPLACE_WITH_YOUR_BUCKET` strings with your bucket name. Grant this identity only to the application process; do not put IAM credentials in browser code or commit them. The policy restricts bucket listing and object read/write/delete to `uploads/`. The health check lists at most one object under that prefix. Use an IAM user access key only if you cannot use a role or another short-lived credential source.

Configure the AWS SDK credential chain. For a local AWS CLI profile, run:

```sh
aws configure
```

Alternatively use your organization's supported credential process, environment credentials, or an IAM role. Never paste credentials into source files or commit a credentials file.

Copy the environment template:

```sh
cp .env.example .env
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `AWS_REGION` to the bucket's Region, `S3_BUCKET` to your bucket name, and choose your own `APP_USERNAME` and `APP_PASSWORD`. Set `SESSION_SECRET` to a random value of at least 32 characters. You can generate one with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` private; it is ignored by Git. Do not use the template values as real login credentials. `MAX_UPLOAD_MB` defaults to 10 and supports values up to 100. `PORT` defaults to 3000. Set `COOKIE_SECURE=true` when serving over HTTPS; leave it unset for local HTTP development.

Start the application:

```sh
npm start
```

Open <http://localhost:3000> and sign in with the application username and password from `.env`. Upload a file, refresh the list, download it using the temporary signed link, or delete it. The `/api/health` endpoint checks access to the configured bucket; it does not require a login.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `AWS_REGION` | Yes | Region containing the bucket |
| `S3_BUCKET` | Yes | Your private bucket name |
| `APP_USERNAME` | Yes | Local demo login name |
| `APP_PASSWORD` | Yes | Local demo login password |
| `SESSION_SECRET` | Yes | Random session-signing secret, at least 32 characters |
| `PORT` | No | HTTP port (default `3000`) |
| `MAX_UPLOAD_MB` | No | Upload size limit (default `10`, maximum `100`) |
| `COOKIE_SECURE` | No | Set to `true` when using HTTPS |

The AWS SDK uses its standard credential provider chain. No AWS access key or secret is configured in application source or the frontend.

## Verification

```sh
npm run check
```

This checks JavaScript syntax. The project does not currently include an automated test suite. S3 upload, download, list, delete, and health operations require the user's own AWS account, bucket, and IAM access.

## Security

- Credentials and account-specific values are not included. Use your own AWS account and keep local `.env` and AWS credentials files private.
- Keep the S3 bucket private with Block Public Access enabled. CloudVault does not require public access.
- Use least-privilege IAM permissions; the included policy is scoped to one bucket and the `uploads/` prefix.
- Upload requests specify SSE-S3 (`AES256`).
- Download access is issued through presigned URLs that expire in five minutes; they are bearer links while valid, so do not share them.
- Object keys are generated by the server and constrained to the app's upload-key format for download and delete requests.
- The demo uses the default in-memory Express session store and HTTP for local development. Do not expose it to the public internet as-is. A deployed instance needs HTTPS, a production session store, and additional controls appropriate to its users and threat model.

## Troubleshooting

- **Startup says configuration is missing:** copy `.env.example` to `.env` and set all required values. `SESSION_SECRET` must be at least 32 characters.
- **Health check fails:** confirm the bucket exists, `AWS_REGION` matches it, credentials resolve for the process, and the IAM identity has the policy permissions.
- **Access denied:** check that the configured AWS identity is the one intended and that the bucket name in the IAM policy matches `S3_BUCKET`.
- **Port is in use:** set a different `PORT` in `.env` and open that port locally.
- **Upload rejected:** check `MAX_UPLOAD_MB`; the configured maximum is 100 MB.

## Project structure

- `src/server.js` — Express routes, session login, validation, and HTTP handling
- `src/s3.js` — AWS SDK client and S3 operations
- `public/` — browser interface
- `docs/IAM-POLICY-TEMPLATE.json` — least-privilege policy template
- `docs/ARCHITECTURE.md` — architecture overview
- `docs/REPORT-NOTES.md` — report evidence and concept notes

## References

- [AWS SDK for JavaScript v3 credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [Amazon S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/configuring-block-public-access.html)
- [Amazon S3 default encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html)

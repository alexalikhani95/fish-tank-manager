# Prod, one flat root (ADR-0012). Applied only by `npm run deploy`; runbook in docs/design/lld.md.
terraform {
  required_version = ">= 1.10" # use_lockfile
  required_providers {
    # >= 6.28: the function URL resource adds both public-invoke permissions itself.
    aws = { source = "hashicorp/aws", version = "~> 6.73" }
  }
  backend "s3" {
    bucket       = "fishtank-tfstate-107014414355"
    key          = "prod/terraform.tfstate"
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "eu-west-2"
}

variable "image_tag" {
  description = "API image tag in ECR: the full commit SHA"
  type        = string
}

resource "aws_ecr_repository" "api" {
  name                 = "fishtank-api"
  image_tag_mutability = "MUTABLE" # re-deploying a commit re-pushes its tag
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# Put there by hand (lld.md → Prod runbook); Terraform only reads them.
data "aws_ssm_parameter" "secret" {
  for_each = toset(["MONGO_URL", "APP_KEY", "JWT_SECRET"])
  name     = "/fishtank/prod/${each.key}"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/fishtank-api"
  retention_in_days = 14
}

resource "aws_iam_role" "api" {
  name = "fishtank-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "api_logs" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.api.arn}:*"
    }]
  })
}

resource "aws_lambda_function" "api" {
  function_name = "fishtank-api"
  role          = aws_iam_role.api.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 15
  # No reserved concurrency until AWS raises the account limit (ADR-0004).

  environment {
    variables = merge({
      NODE_ENV                     = "production"
      HOST                         = "0.0.0.0"
      PORT                         = "8080"
      LOG_LEVEL                    = "info"
      TZ                           = "UTC"
      AWS_LWA_READINESS_CHECK_PATH = "/api/v1/health"
      APP_URL                      = "https://localhost" # required by start/env.ts, unused; the real URL would be a cycle
    }, { for k, p in data.aws_ssm_parameter.secret : k => p.value })
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.api_logs]
}

# Auth NONE (ADR-0012). The provider adds lambda:InvokeFunctionUrl and lambda:InvokeFunction
# (InvokedViaFunctionUrl) for principal * on create; AWS requires both since October 2025.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}

# Explicit, tracked in state. Statement IDs differ from the provider's own (it adds FunctionURLAllow*
# on create), or AddPermission would conflict. Keep invoked_via_function_url: without it any AWS
# account could call lambda:Invoke directly.
resource "aws_lambda_permission" "url_public" {
  statement_id           = "PublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "url_invoke" {
  statement_id             = "PublicInvokeViaFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true
}

# PWA: private bucket, read only by CloudFront through OAC.
resource "aws_s3_bucket" "pwa" {
  bucket = "fishtank-pwa-107014414355" # account id keeps the global name unique
}

resource "aws_s3_bucket_public_access_block" "pwa" {
  bucket                  = aws_s3_bucket.pwa.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "pwa" {
  bucket = aws_s3_bucket.pwa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.pwa.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.app.arn } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.pwa]
}

resource "aws_cloudfront_origin_access_control" "pwa" {
  name                              = "fishtank-pwa"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# SPA deep links: a path with no file extension gets the app shell. Default behaviour only, so
# /api/* is never rewritten. Not custom error responses: those would turn the API's JSON errors
# into HTML (ADR-0006).
resource "aws_cloudfront_function" "spa" {
  name    = "fishtank-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      if (!/\.[^/]*$/.test(request.uri)) request.uri = '/index.html';
      return request;
    }
  JS
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards Cookie, query and headers, but not Host: the function URL rejects any other host.
data "aws_cloudfront_origin_request_policy" "all_but_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# One HTTPS origin for the PWA and /api/*, so the auth cookie works unchanged (ADR-0006).
# The function URL stays public (auth NONE, ADR-0012): CloudFront is not a security boundary here.
resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  default_root_object = "index.html"

  origin {
    origin_id                = "pwa"
    domain_name              = aws_s3_bucket.pwa.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.pwa.id
  }

  origin {
    origin_id   = "api"
    domain_name = trimsuffix(trimprefix(aws_lambda_function_url.api.function_url, "https://"), "/")
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "pwa"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_but_host.id
  }

  # No custom_error_response: it would apply to /api/* too (see the function above).

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Nightly backup (ADR-0013): private bucket, copies expire after 30 days. No versioning (spec).
resource "aws_s3_bucket" "backups" {
  bucket = "fishtank-backups-107014414355"
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    id     = "expire-after-30-days"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# GitHub Actions logs in with OIDC; no AWS key lives in GitHub (ADR-0013).
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# Any workflow on main of this repo (ADR-0013). No `environment:` in the workflow: it changes `sub`.
resource "aws_iam_role" "backup" {
  name = "fishtank-backup"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          # The ids are in the sub because this repo uses immutable subject claims; a recreated repo or renamed owner cannot match.
          "token.actions.githubusercontent.com:sub" = "repo:alexalikhani95@44570800/fish-tank-manager@1380354722:ref:refs/heads/main"
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

# Add-only: PutObject only with If-None-Match, so S3 refuses an overwrite (412). No Get, List or
# Delete. No kms:Decrypt: MONGO_URL uses the AWS-managed alias/aws/ssm key.
resource "aws_iam_role_policy" "backup" {
  role = aws_iam_role.backup.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.backups.arn}/*"
        Condition = { Null = { "s3:if-none-match" = "false" } }
      },
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = data.aws_ssm_parameter.secret["MONGO_URL"].arn
      },
    ]
  })
}

output "backup_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "backup_role_arn" {
  value = aws_iam_role.backup.arn
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "pwa_bucket" {
  value = aws_s3_bucket.pwa.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}

output "function_url" {
  value = aws_lambda_function_url.api.function_url
}

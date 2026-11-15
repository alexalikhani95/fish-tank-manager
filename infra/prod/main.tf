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

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}

output "function_url" {
  value = aws_lambda_function_url.api.function_url
}

#!/usr/bin/env bash
set -euo pipefail

# Creates an Elastic Cloud deployment on staging.found.no sized for
# Entity Analytics performance testing, with the right feature flags enabled.
#
# Prerequisites:
#   - curl, jq
#   - EC_API_KEY environment variable (staging.found.no API key)
#
# Usage:
#   ./create_perf_env.sh [options]
#
# Options:
#   --name <name>          Deployment name (default: ea-perf-test)
#   --size <profile>       Size profile: default|medium|large (default: medium)
#   --version <ver>        Stack version (default: 9.4.0-SNAPSHOT)
#   --region <region>      Cloud region (default: gcp-us-central1)
#   --api-url <url>        ESS API base URL (default: https://staging.found.no)
#   --no-wait              Don't wait for deployment to become healthy
#   --dry-run              Print the payload without creating anything
#
# Examples:
#   EC_API_KEY=your-key ./create_perf_env.sh --name ea-perf-p90 --size medium
#   EC_API_KEY=your-key ./create_perf_env.sh --size large --version 9.4.0 --dry-run

# ── Defaults ──────────────────────────────────────────────────────────────────

DEPLOY_NAME="ea-perf-test"
SIZE_PROFILE="medium"
STACK_VERSION="9.4.0-SNAPSHOT"
REGION="gcp-us-central1"
API_URL="https://staging.found.no"
WAIT=true
DRY_RUN=false

# ── Parse args ────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)       DEPLOY_NAME="$2"; shift 2 ;;
    --size)       SIZE_PROFILE="$2"; shift 2 ;;
    --version)    STACK_VERSION="$2"; shift 2 ;;
    --region)     REGION="$2"; shift 2 ;;
    --api-url)    API_URL="$2"; shift 2 ;;
    --no-wait)    WAIT=false; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────────────────────

if [[ -z "${EC_API_KEY:-}" ]] && [[ "$DRY_RUN" == "false" ]]; then
  echo "Error: EC_API_KEY environment variable is required" >&2
  echo "Get one from: ${API_URL}/deployment-features/keys" >&2
  exit 1
fi

for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed" >&2
    exit 1
  fi
done

# ── Size profiles (aligned with current entity store benchmark targets) ───────
#
#   Profile   ES RAM    Kibana RAM   Handles
#   default   8 GB      8 GB         Small / default-sized runs
#   medium    32 GB     16 GB        P90 / medium-sized runs
#   large     64 GB     32 GB        P95 / large-sized runs

case "$SIZE_PROFILE" in
  default)
    ES_SIZE=8192
    KIBANA_SIZE=8192
    ;;
  medium)
    ES_SIZE=32768
    KIBANA_SIZE=16384
    ;;
  large)
    ES_SIZE=65536
    KIBANA_SIZE=32768
    ;;
  *)
    echo "Error: Unknown size profile '$SIZE_PROFILE'. Use: default, medium, large" >&2
    exit 1
    ;;
esac

echo "=== Entity Analytics Performance Test Environment ==="
echo "  Name:     $DEPLOY_NAME"
echo "  Size:     $SIZE_PROFILE (ES: $((ES_SIZE / 1024)) GB, Kibana: $((KIBANA_SIZE / 1024)) GB)"
echo "  Version:  $STACK_VERSION"
echo "  Region:   $REGION"
echo "  API:      $API_URL"
echo ""

# ── Kibana feature flags ─────────────────────────────────────────────────────
# These are xpack.securitySolution.enableExperimental flags needed for
# entity store V2, watchlists, and lead generation (all off by default in 9.4).

KIBANA_USER_SETTINGS=$(cat <<'YAML'
xpack.securitySolution.enableExperimental:
  - entityAnalyticsEntityStoreV2
  - entityAnalyticsWatchlistEnabled
  - leadGenerationEnabled
  - leadGenerationDetailsEnabled
YAML
)

# ── Build deployment payload ──────────────────────────────────────────────────

PAYLOAD=$(cat <<EOF
{
  "name": "${DEPLOY_NAME}",
  "settings": {
    "autoscaling_enabled": false,
    "solution_type": "security"
  },
  "metadata": {
    "system_owned": false
  },
  "resources": {
    "elasticsearch": [
      {
        "ref_id": "main-elasticsearch",
        "region": "${REGION}",
        "plan": {
          "cluster_topology": [
            {
              "id": "hot_content",
              "node_roles": [
                "master", "ingest", "transform",
                "data_hot", "remote_cluster_client", "data_content"
              ],
              "zone_count": 2,
              "elasticsearch": {
                "node_attributes": { "data": "hot" }
              },
              "instance_configuration_id": "gcp.es.datahot.n2.68x10x45",
              "size": {
                "value": ${ES_SIZE},
                "resource": "memory"
              }
            },
            {
              "id": "ml",
              "node_roles": ["ml", "remote_cluster_client"],
              "zone_count": 1,
              "instance_configuration_id": "gcp.es.ml.n2.68x32x45",
              "autoscaling_tier_override": true,
              "autoscaling_min": { "value": 0, "resource": "memory" },
              "autoscaling_max": { "value": 65536, "resource": "memory" }
            }
          ],
          "elasticsearch": {
            "version": "${STACK_VERSION}",
            "enabled_built_in_plugins": []
          },
          "deployment_template": {
            "id": "gcp-storage-optimized"
          }
        },
        "settings": {
          "dedicated_masters_threshold": 6
        }
      }
    ],
    "kibana": [
      {
        "ref_id": "main-kibana",
        "elasticsearch_cluster_ref_id": "main-elasticsearch",
        "region": "${REGION}",
        "plan": {
          "cluster_topology": [
            {
              "instance_configuration_id": "gcp.kibana.n2.68x32x45",
              "size": {
                "value": ${KIBANA_SIZE},
                "resource": "memory"
              },
              "zone_count": 1
            }
          ],
          "kibana": {
            "version": "${STACK_VERSION}",
            "user_settings_yaml": $(echo "$KIBANA_USER_SETTINGS" | jq -Rs .)
          }
        }
      }
    ],
    "integrations_server": [
      {
        "ref_id": "main-integrations_server",
        "elasticsearch_cluster_ref_id": "main-elasticsearch",
        "region": "${REGION}",
        "plan": {
          "cluster_topology": [
            {
              "instance_configuration_id": "gcp.integrationsserver.n2.68x32x45",
              "size": {
                "value": 1024,
                "resource": "memory"
              },
              "zone_count": 1
            }
          ],
          "integrations_server": {
            "version": "${STACK_VERSION}"
          }
        }
      }
    ]
  }
}
EOF
)

# ── Dry run ───────────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Payload (dry run):"
  echo "$PAYLOAD" | jq .
  echo ""
  echo "Kibana user settings:"
  echo "$KIBANA_USER_SETTINGS"
  echo ""
  echo "To create: curl -s -X POST '${API_URL}/api/v1/deployments?validate_only=false' \\"
  echo "  -H 'Authorization: ApiKey \$EC_API_KEY' \\"
  echo "  -H 'Content-Type: application/json' \\"
  echo "  -d '<payload>'"
  exit 0
fi

# ── Create deployment ─────────────────────────────────────────────────────────

echo "Creating deployment..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${API_URL}/api/v1/deployments?validate_only=false" \
  -H "Authorization: ApiKey ${EC_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  echo "Error: API returned HTTP $HTTP_CODE" >&2
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY" >&2
  exit 1
fi

DEPLOYMENT_ID=$(echo "$BODY" | jq -r '.id')
ES_PASSWORD=$(echo "$BODY" | jq -r '.resources[] | select(.ref_id == "main-elasticsearch") | .credentials.password')
ES_USERNAME=$(echo "$BODY" | jq -r '.resources[] | select(.ref_id == "main-elasticsearch") | .credentials.username')
ES_CLUSTER_ID=$(echo "$BODY" | jq -r '.resources[] | select(.ref_id == "main-elasticsearch") | .id')

echo "  Deployment ID: $DEPLOYMENT_ID"
echo "  ES Cluster ID: $ES_CLUSTER_ID"
echo "  Credentials:   ${ES_USERNAME} / ${ES_PASSWORD}"

# ── Wait for healthy ──────────────────────────────────────────────────────────

if [[ "$WAIT" == "false" ]]; then
  echo ""
  echo "Skipping health check (--no-wait). Poll manually:"
  echo "  curl -s '${API_URL}/api/v1/deployments/${DEPLOYMENT_ID}' -H 'Authorization: ApiKey \$EC_API_KEY' | jq '.healthy'"
  exit 0
fi

echo ""
echo "Waiting for deployment to become healthy (this typically takes 3-8 minutes)..."

MAX_ATTEMPTS=60
POLL_INTERVAL=15

for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
  STATUS_RESPONSE=$(curl -s \
    "${API_URL}/api/v1/deployments/${DEPLOYMENT_ID}" \
    -H "Authorization: ApiKey ${EC_API_KEY}")

  HEALTHY=$(echo "$STATUS_RESPONSE" | jq -r '.healthy')
  ES_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.resources.elasticsearch[0].info.status // "pending"')
  KBN_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.resources.kibana[0].info.status // "pending"')

  echo "  [$(date +%H:%M:%S)] attempt ${i}/${MAX_ATTEMPTS} — healthy=${HEALTHY} es=${ES_STATUS} kibana=${KBN_STATUS}"

  if [[ "$HEALTHY" == "true" ]]; then
    break
  fi

  if [[ $i -eq $MAX_ATTEMPTS ]]; then
    echo "Error: Deployment did not become healthy within $((MAX_ATTEMPTS * POLL_INTERVAL))s" >&2
    exit 1
  fi

  sleep "$POLL_INTERVAL"
done

# ── Extract URLs ──────────────────────────────────────────────────────────────

ES_URL=$(echo "$STATUS_RESPONSE" | jq -r '.resources.elasticsearch[0].info.metadata.service_url // empty')
KBN_URL=$(echo "$STATUS_RESPONSE" | jq -r '.resources.kibana[0].info.metadata.service_url // empty')

# Fallback: construct from cluster ID if metadata isn't available
if [[ -z "$ES_URL" ]]; then
  ES_URL="https://${ES_CLUSTER_ID}.${REGION}.gcp.elastic-cloud.com:9243"
  echo "  (ES URL constructed from cluster ID — verify manually)"
fi
if [[ -z "$KBN_URL" ]]; then
  KBN_URL=$(echo "$STATUS_RESPONSE" | jq -r '.resources.kibana[0].info.metadata.service_url // empty')
fi

# ── Enable self-monitoring (logging + metrics) ──────────────────────────────
# Ship deployment logs/metrics to the deployment's own ES cluster.
# Required so extract-risk-scoring-metrics --from-es can query elastic-cloud-logs-*.

echo "Enabling deployment observability (self-monitoring)..."
OBS_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  "${API_URL}/api/v1/deployments/${DEPLOYMENT_ID}" \
  -H "Authorization: ApiKey ${EC_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"prune_orphans\": false,
    \"settings\": {
      \"observability\": {
        \"logging\": {
          \"destination\": {
            \"deployment_id\": \"self\",
            \"ref_id\": \"main-elasticsearch\"
          }
        },
        \"metrics\": {
          \"destination\": {
            \"deployment_id\": \"self\",
            \"ref_id\": \"main-elasticsearch\"
          }
        }
      }
    }
  }")

OBS_HTTP=$(echo "$OBS_RESPONSE" | tail -1)
if [[ "$OBS_HTTP" -ge 200 && "$OBS_HTTP" -lt 300 ]]; then
  echo "  Observability enabled (logs + metrics → self)"
else
  echo "  Warning: observability update returned HTTP $OBS_HTTP — enable manually via Cloud Console" >&2
fi

echo ""
echo "=== Deployment Ready ==="
echo "  Kibana:        ${KBN_URL}"
echo "  Elasticsearch: ${ES_URL}"
echo "  Username:      ${ES_USERNAME}"
echo "  Password:      ${ES_PASSWORD}"
echo "  Deployment:    ${API_URL}/deployments/${DEPLOYMENT_ID}"
echo ""

# ── Write env file ────────────────────────────────────────────────────────────

ENV_FILE="$(dirname "$0")/../.env.${DEPLOY_NAME}"

cat > "$ENV_FILE" <<ENVEOF
# Generated by create_perf_env.sh at $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Deployment: ${DEPLOY_NAME} (${SIZE_PROFILE} profile)
# Stack version: ${STACK_VERSION}
export DEPLOYMENT_ID="${DEPLOYMENT_ID}"
export ES_CLUSTER_ID="${ES_CLUSTER_ID}"
export ELASTIC_NODE="${ES_URL}"
export ELASTIC_USERNAME="${ES_USERNAME}"
export ELASTIC_PASSWORD="${ES_PASSWORD}"
export KIBANA_NODE="${KBN_URL}"
export KIBANA_USERNAME="${ES_USERNAME}"
export KIBANA_PASSWORD="${ES_PASSWORD}"
export EC_API_KEY="${EC_API_KEY}"
export EC_API_URL="${API_URL}"
ENVEOF

echo "Environment file written to: ${ENV_FILE}"
echo "Source it with:  source ${ENV_FILE}"
echo ""
echo "Next steps:"
echo "  1. source ${ENV_FILE}"
echo "  2. Wait ~90s for elastic-cloud-logs index to appear (observability was auto-enabled above)"
echo "  3. Run preflight:  cd security-documents-generator && yarn start ea-perf preflight --env-path ${ENV_FILE} --fix"
echo "  4. Seed data:  yarn start risk-engine create-perf-scenario ..."

# 📅 Timestamp Configuration Features

## Overview

The Security Documents Generator now supports configurable timestamp generation for multi-day data creation with realistic time distribution patterns. This enhancement allows users to generate historical security data across custom date ranges with various behavioral patterns.

## ✨ Key Features

### 🗓️ **Flexible Date Ranges**
- **Relative dates**: `"7d"`, `"1w"`, `"1M"`, `"1y"`
- **Absolute dates**: `"2024-01-01T00:00:00Z"`, `"2024-12-31"`
- **Special values**: `"now"` (current time)

### ⏰ **Time Distribution Patterns**
- **`uniform`**: Even distribution across time range
- **`business_hours`**: 70% during 9 AM - 6 PM, Mon-Fri
- **`random`**: High variance, completely random timestamps
- **`attack_simulation`**: Burst patterns, late-night activity
- **`weekend_heavy`**: 60% weekend activity

### 🔗 **Attack Chain Timestamps**
- **Tight sequence**: 1-15 minutes between techniques
- **Burst pattern**: Seconds to few minutes (rapid execution)
- **Spread pattern**: Hours between techniques (persistent threats)

## 🚀 Command-Line Usage

### Basic Timestamp Configuration
```bash
# Generate alerts over the last 7 days with business hours pattern
yarn start generate-alerts -n 100 -h 10 -u 5 --start-date "7d" --end-date "now" --time-pattern "business_hours"

# Generate weekend-heavy activity over 2 weeks
yarn start generate-alerts -n 200 -h 20 -u 10 --start-date "2w" --time-pattern "weekend_heavy"

# Simulate attack patterns over 1 month
yarn start generate-alerts -n 500 -h 50 -u 25 --ai --mitre --attack-chains --start-date "1M" --time-pattern "attack_simulation"

# Generate data for specific date range
yarn start generate-alerts -n 50 -h 5 -u 3 --start-date "2024-01-01" --end-date "2024-01-07" --time-pattern "uniform"
```

### Advanced Combinations
```bash
# Complete Phase 3 with timestamps
yarn start generate-alerts -n 1000 -h 50 -u 25 \
  --ai --mitre --sub-techniques --attack-chains --large-scale \
  --start-date "30d" --end-date "now" --time-pattern "attack_simulation"

# Business hours simulation for corporate environment
yarn start generate-events 500 \
  --start-date "1w" --time-pattern "business_hours"
```

## ⚙️ Configuration

### JSON Configuration
```json
{
  "timestamps": {
    "startDate": "7d",
    "endDate": "now",
    "pattern": "business_hours",
    "enableMultiDay": true,
    "daySpread": 7,
    "examples": {
      "7_days_ago": "7d",
      "1_week_ago": "1w",
      "1_month_ago": "1M",
      "specific_date": "2024-01-01T00:00:00Z",
      "patterns": ["uniform", "business_hours", "random", "attack_simulation", "weekend_heavy"]
    }
  }
}
```

### Command-Line Flags
| Flag | Description | Example |
|------|-------------|---------|
| `--start-date <date>` | Start date for data generation | `"7d"`, `"1w"`, `"2024-01-01"` |
| `--end-date <date>` | End date for data generation | `"now"`, `"1d"`, `"2024-01-10"` |
| `--time-pattern <pattern>` | Time distribution pattern | `"business_hours"`, `"attack_simulation"` |

## 🏗️ Technical Implementation

### Core Components

#### 1. **Timestamp Utilities** (`src/utils/timestamp_utils.ts`)
- `generateTimestamp(config)`: Generate single timestamp with pattern
- `generateAttackChainTimestamps(count, config)`: Generate sequence for attack chains
- `getTimeRange(config)`: Parse and validate date ranges
- `getTimeRangeStats(config)`: Calculate time range statistics

#### 2. **Pattern Implementations**
- **Business Hours**: Weighted toward 9 AM - 6 PM, Monday-Friday
- **Attack Simulation**: Late night (11 PM - 4 AM), burst patterns, weekend activity
- **Weekend Heavy**: 60% weekend, 40% weekday distribution
- **Random**: High variance using faker.js for unpredictability
- **Uniform**: Even distribution across entire time range

#### 3. **Integration Points**
- **Alert Creation** (`src/create_alerts.ts`): Uses `generateTimestamp()`
- **Event Creation** (`src/create_events.ts`): Uses `generateTimestamp()`
- **AI Service** (`src/utils/ai_service.ts`): Attack chain timestamp sequences
- **CLI Interface** (`src/index.ts`): Command-line flag processing

## 📊 Time Range Statistics

The system automatically calculates statistics for any time range:

```javascript
// Example for 7-day range
{
  totalDays: 7,
  totalHours: 168,
  weekdays: 5,      // Monday-Friday
  weekends: 2,      // Saturday-Sunday
  businessHours: 45 // 9 AM - 6 PM on weekdays
}
```

## 🎯 Use Cases

### 1. **Security Testing**
```bash
# Simulate 30-day attack campaign
yarn start generate-alerts -n 2000 -h 100 -u 50 \
  --ai --mitre --attack-chains \
  --start-date "30d" --time-pattern "attack_simulation"
```

### 2. **Corporate Environment Simulation**
```bash
# Generate business hours activity for compliance testing
yarn start generate-events 1000 \
  --start-date "1M" --time-pattern "business_hours"
```

### 3. **Anomaly Detection Training**
```bash
# Create weekend-heavy patterns for anomaly detection
yarn start generate-alerts -n 500 -h 25 -u 15 \
  --start-date "2w" --time-pattern "weekend_heavy"
```

### 4. **Performance Testing**
```bash
# Large-scale historical data generation
yarn start generate-alerts -n 10000 -h 500 -u 250 \
  --large-scale --start-date "3M" --time-pattern "uniform"
```

## 🔧 Advanced Features

### Attack Chain Sequencing
When using `--attack-chains`, timestamps follow realistic progression:
- Initial access techniques occur first
- Subsequent techniques follow with realistic delays
- Burst patterns simulate rapid execution phases
- Spread patterns simulate persistent threat campaigns

### Legacy Compatibility
The system maintains backward compatibility with existing `eventDateOffsetHours` configuration while providing enhanced multi-day capabilities.

### Performance Optimization
- Efficient timestamp generation for large datasets
- Caching of time range calculations
- Optimized pattern algorithms for minimal overhead

## 🚀 Future Enhancements

Potential areas for expansion:
- **Timezone Support**: Multi-timezone data generation
- **Custom Patterns**: User-defined time distribution patterns
- **Seasonal Patterns**: Holiday and seasonal activity simulation
- **Correlation Patterns**: Coordinated timestamp patterns across entities
- **Real-time Streaming**: Live timestamp generation for streaming scenarios

## 📝 Examples Output

### Business Hours Pattern
```
2024-01-15T09:23:45.123Z  (Monday 9:23 AM)
2024-01-15T14:56:12.456Z  (Monday 2:56 PM)
2024-01-16T11:34:28.789Z  (Tuesday 11:34 AM)
```

### Attack Simulation Pattern
```
2024-01-15T23:45:12.123Z  (Sunday 11:45 PM - late night)
2024-01-15T23:47:34.456Z  (Sunday 11:47 PM - burst)
2024-01-16T02:15:45.789Z  (Monday 2:15 AM - overnight)
```

### Weekend Heavy Pattern
```
2024-01-13T15:23:45.123Z  (Saturday 3:23 PM)
2024-01-14T10:45:12.456Z  (Sunday 10:45 AM)
2024-01-14T19:34:28.789Z  (Sunday 7:34 PM)
```

This timestamp configuration system provides comprehensive control over temporal data generation, enabling realistic security testing scenarios across any time range with appropriate behavioral patterns.
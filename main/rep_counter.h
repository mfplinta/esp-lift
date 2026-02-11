#ifndef REP_COUNTER_H
#define REP_COUNTER_H

#include <cJSON.h>
#include <esp_log.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

#include "encoder.h"
#include "utils.h"

#define REP_DEADBAND 10.0

typedef enum { REP_SIDE_LEFT = 0, REP_SIDE_RIGHT = 1 } rep_side_t;

typedef struct {
  double thresholds[2];
  bool has_threshold[2];
  bool armed[2];
} rep_counter_t;

static bool parse_side(const char *name, rep_side_t *side_out) {
  if (!name || !side_out) return false;
  if (strcmp(name, "left") == 0) {
    *side_out = REP_SIDE_LEFT;
    return true;
  }
  if (strcmp(name, "right") == 0) {
    *side_out = REP_SIDE_RIGHT;
    return true;
  }
  return false;
}

void rep_counter_init(rep_counter_t *counter) {
  if (!counter) return;
  counter->thresholds[REP_SIDE_LEFT] = 0.0;
  counter->thresholds[REP_SIDE_RIGHT] = 0.0;
  counter->has_threshold[REP_SIDE_LEFT] = false;
  counter->has_threshold[REP_SIDE_RIGHT] = false;
  counter->armed[REP_SIDE_LEFT] = false;
  counter->armed[REP_SIDE_RIGHT] = false;
}

void rep_counter_handle_ws_message(const char *payload, size_t len, void *ctx) {
  rep_counter_t *counter = (rep_counter_t *) ctx;
  if (!counter || !payload || len == 0) return;

  cJSON *root = cJSON_ParseWithLength(payload, len);
  if (!root) return;

  const cJSON *event = cJSON_GetObjectItem(root, "event");
  if (!cJSON_IsString(event) || strcmp(event->valuestring, "threshold") != 0) {
    cJSON_Delete(root);
    return;
  }

  const cJSON *name = cJSON_GetObjectItem(root, "name");
  const cJSON *threshold = cJSON_GetObjectItem(root, "threshold");
  if (!cJSON_IsString(name) || !cJSON_IsNumber(threshold)) {
    cJSON_Delete(root);
    return;
  }

  rep_side_t side;
  if (!parse_side(name->valuestring, &side)) {
    cJSON_Delete(root);
    return;
  }

  double clamped = clamp_double(threshold->valuedouble, 0.0, 100.0);
  counter->thresholds[side] = clamped;
  counter->has_threshold[side] = true;
  counter->armed[side] = false;

  ESP_LOGI("REP_COUNTER", "Threshold updated: %s -> %.1f", name->valuestring, clamped);

  cJSON_Delete(root);
}

static bool rep_counter_ready(rep_counter_t *counter) {
  return counter->has_threshold[REP_SIDE_LEFT] && counter->has_threshold[REP_SIDE_RIGHT];
}

bool rep_counter_check(rep_counter_t *counter, rep_side_t side, double position,
                       calibration_state_t cal_state) {
  if (!counter) return false;
  if (!rep_counter_ready(counter)) return false;
  if (cal_state != CAL_DONE) {
    counter->armed[side] = false;
    return false;
  }

  double pos = clamp_double(position, 0.0, 100.0);
  double threshold = counter->thresholds[side];
  double arm_point = clamp_double(threshold - REP_DEADBAND, 0.0, 100.0);
  double fire_point = clamp_double(threshold, 0.0, 100.0);

  if (!counter->armed[side] && pos <= arm_point) {
    counter->armed[side] = true;
    return false;
  }

  if (counter->armed[side] && pos >= fire_point) {
    counter->armed[side] = false;
    return true;
  }

  return false;
}

#endif

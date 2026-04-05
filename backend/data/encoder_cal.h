#ifndef ENCODER_CAL_H
#define ENCODER_CAL_H

#include <cJSON.h>
#include <esp_err.h>
#include "../encoder.h"
#include "../utils.h"

static cJSON *encoder_cal_to_json(const encoder_state_t *state) {
  cJSON *root = cJSON_CreateObject();
  if (!root) return NULL;
  cJSON_AddNumberToObject(root, "cal_state", state->cal_state);
  cJSON_AddNumberToObject(root, "cal_dir", state->cal_dir);
  cJSON_AddNumberToObject(root, "max_distance", state->max_distance);
  return root;
}

static void encoder_cal_from_json(encoder_state_t *state, const cJSON *root) {
  if (!state || !root) return;
  const cJSON *cal_state = cJSON_GetObjectItem(root, "cal_state");
  const cJSON *cal_dir = cJSON_GetObjectItem(root, "cal_dir");
  const cJSON *max_distance = cJSON_GetObjectItem(root, "max_distance");
  if (cJSON_IsNumber(cal_state)) state->cal_state = (calibration_state_t)cal_state->valueint;
  if (cJSON_IsNumber(cal_dir)) state->cal_dir = (rotation_dir_t)cal_dir->valueint;
  if (cJSON_IsNumber(max_distance)) state->max_distance = max_distance->valueint;
  state->start_count = 0;
  state->calibrated = 0.0;
}

esp_err_t encoder_cal_load_file(const char *path, encoder_state_t *state) {
    if (!state || !path) return ESP_ERR_INVALID_ARG;
    cJSON *root = cjson_read_from_file(path);
    if (!root) return ESP_FAIL;
    encoder_cal_from_json(state, root);
    cJSON_Delete(root);
    return ESP_OK;
}

esp_err_t encoder_cal_save_file(const char *path, const encoder_state_t *state) {
    if (!state || !path) return ESP_ERR_INVALID_ARG;
    cJSON *root = encoder_cal_to_json(state);
    if (!root) return ESP_ERR_NO_MEM;
    int res = cjson_save_to_file(root, path);
    cJSON_Delete(root);
    return res == 0 ? ESP_OK : ESP_FAIL;
}


#endif

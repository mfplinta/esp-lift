#ifndef HTTP_API_EXERCISES_H
#define HTTP_API_EXERCISES_H

#include "../../store/exercises_store.h"
#include "../../utils.h"
#include <cJSON.h>
#include <esp_http_server.h>
#include <esp_log.h>
#include <stdbool.h>
#include <uuid.h>

esp_err_t get_exercises_handler(httpd_req_t *req);
esp_err_t post_exercises_handler(httpd_req_t *req);
esp_err_t delete_exercises_handler(httpd_req_t *req);

void http_api_exercises_register(httpd_handle_t server, const char *exercises_json) {
  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/exercises",
                                                       .method = HTTP_GET,
                                                       .handler = get_exercises_handler,
                                                       .user_ctx = (void *) exercises_json}));
  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/exercises",
                                                       .method = HTTP_POST,
                                                       .handler = post_exercises_handler,
                                                       .user_ctx = (void *) exercises_json}));

  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/exercises",
                                                       .method = HTTP_DELETE,
                                                       .handler = delete_exercises_handler,
                                                       .user_ctx = (void *) exercises_json}));
}

esp_err_t get_exercises_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_EXERCISES");
  char *json_string = NULL;

  if (exercises_store_load_json_string((char *) req->user_ctx, &json_string) != EXIT_SUCCESS) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to load exercises");
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "application/json");
  esp_err_t res = httpd_resp_send(req, json_string, HTTPD_RESP_USE_STRLEN);
  if(json_string) free(json_string);
  return res;
}

esp_err_t post_exercises_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_EXERCISES");
  esp_err_t res = ESP_FAIL;

  cJSON *req_json = httpd_read_json_body(req);

  if (!req_json) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    goto cleanup;
  }

  cJSON *name = cJSON_GetObjectItemCaseSensitive(req_json, "name");
  cJSON *threshold = cJSON_GetObjectItemCaseSensitive(req_json, "thresholdPercentage");
  cJSON *type = cJSON_GetObjectItemCaseSensitive(req_json, "type");
  cJSON *category_id = cJSON_GetObjectItemCaseSensitive(req_json, "categoryId");
  cJSON *category_name = cJSON_GetObjectItemCaseSensitive(req_json, "categoryName");
  cJSON *rep_band = cJSON_GetObjectItemCaseSensitive(req_json, "repBand");
  double rep_band_value = cJSON_IsNumber(rep_band) ? rep_band->valuedouble : EXERCISE_DEFAULT_REP_BAND;

  if (!cJSON_IsString(name) || !cJSON_IsNumber(threshold) || !cJSON_IsString(type)) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing or invalid fields");
    goto cleanup;
  }

  exercise_type_t exercise_type = exercise_type_from_string(type->valuestring);
  if (exercise_type == EXERCISE_UNKNOWN) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid exercise type");
    goto cleanup;
  }

  exercises_store_upsert_request_t request = {.name = name->valuestring,
                                              .threshold_percentage = threshold->valuedouble,
                                              .type = exercise_type,
                                              .category_id = cJSON_IsString(category_id)
                                                               ? category_id->valuestring
                                                               : NULL,
                                              .category_name = cJSON_IsString(category_name)
                                                                 ? category_name->valuestring
                                                                 : NULL,
                                              .rep_band = rep_band_value};

  if (exercises_store_upsert((char *) req->user_ctx, &request) != EXIT_SUCCESS) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to add exercise");
    goto cleanup;
  }

  res = httpd_resp_sendstr(req, "OK");

cleanup:
  if(req_json) cJSON_Delete(req_json);
  return res;
}

esp_err_t delete_exercises_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_EXERCISES");
  esp_err_t res = ESP_FAIL;

  char name[128];
  if (httpd_req_get_url_query_str(req, name, sizeof(name)) != ESP_OK) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing exercise name");
    goto cleanup;
  }

  char name_value[128];
  if (httpd_query_key_value(name, "name", name_value, sizeof(name_value)) != ESP_OK) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing exercise name");
    goto cleanup;
  }

  char name_decoded[128];
  url_decode(name_decoded, name_value);

  if (exercises_store_delete((char *) req->user_ctx, name_decoded) != EXIT_SUCCESS) {
    httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Exercise not found");
    goto cleanup;
  }

  res = httpd_resp_sendstr(req, "OK");

cleanup:
  return res;
}

#endif

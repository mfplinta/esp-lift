#ifndef HTTP_API_EXERCISES_H
#define HTTP_API_EXERCISES_H

#include "../data/exercises.h"
#include "../utils.h"
#include <cJSON.h>
#include <esp_http_server.h>
#include <esp_log.h>

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
  esp_err_t res = ESP_FAIL;

  char *exercises_json_file = (char *) req->user_ctx;
  cJSON *json = cjson_read_from_file(exercises_json_file);
  char *json_string = NULL;

  if (json == NULL) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to load exercises");
    goto cleanup;
  }
  if ((json_string = cJSON_PrintUnformatted(json)) == NULL) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to serialize JSON");
    goto cleanup;
  }

  httpd_resp_set_type(req, "application/json");
  res = httpd_resp_send(req, json_string, HTTPD_RESP_USE_STRLEN);

cleanup:
  if(json) cJSON_Delete(json);
  if(json_string) free(json_string);
  return res;
}

esp_err_t post_exercises_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_EXERCISES");
  esp_err_t res = ESP_FAIL;

  cJSON *req_json = httpd_read_json_body(req);

  char *exercises_json_file = (char *) req->user_ctx;
  cJSON *exercises_json = cjson_read_from_file(exercises_json_file);

  if (!req_json) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    goto cleanup;
  }

  /* Extract fields */
  cJSON *name = cJSON_GetObjectItemCaseSensitive(req_json, "name");
  cJSON *threshold = cJSON_GetObjectItemCaseSensitive(req_json, "thresholdPercentage");
  cJSON *type = cJSON_GetObjectItemCaseSensitive(req_json, "type");

  if (!cJSON_IsString(name) || !cJSON_IsNumber(threshold) || !cJSON_IsString(type)) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing or invalid fields");
    goto cleanup;
  }

  exercise_type_t exercise_type = exercise_type_from_string(type->valuestring);
  if (exercise_type == EXERCISE_UNKNOWN) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid exercise type");
    goto cleanup;
  }

  /* Add exercise */
  if (exercises_add(exercises_json, name->valuestring, threshold->valuedouble, exercise_type)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to add exercise");
    goto cleanup;
  }

  /* Save */
  if (cjson_save_to_file(exercises_json, exercises_json_file)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to save exercises on server");
    goto cleanup;
  }

  res = httpd_resp_sendstr(req, "OK");

cleanup:
  if(req_json) cJSON_Delete(req_json);
  if(exercises_json) cJSON_Delete(exercises_json);
  return res;
}

esp_err_t delete_exercises_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_EXERCISES");
  esp_err_t res = ESP_FAIL;
  
  char *exercises_json_file = (char *) req->user_ctx;
  cJSON *json = cjson_read_from_file(exercises_json_file);

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

  if (exercises_remove(json, name_decoded)) {
    httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Exercise not found");
    goto cleanup;
  }

  /* Save */
  if (cjson_save_to_file(json, exercises_json_file)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to save exercises on server");
    goto cleanup;
  }

  res = httpd_resp_sendstr(req, "OK");

cleanup:
  if(json) cJSON_Delete(json);
  return res;
}

#endif
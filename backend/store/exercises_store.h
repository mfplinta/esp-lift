#ifndef EXERCISES_STORE_H
#define EXERCISES_STORE_H

#include "../data/exercises.h"
#include "../utils.h"

#include <stdlib.h>
#include <string.h>

typedef struct {
  const char *name;
  double threshold_percentage;
  exercise_type_t type;
  const char *category_id;
  const char *category_name;
  double rep_band;
} exercises_store_upsert_request_t;

static inline int exercises_store_load_json_string(const char *path, char **json_string_out) {
  if (!path || !json_string_out) return EXIT_FAILURE;

  *json_string_out = NULL;
  cJSON *json = cjson_read_from_file(path);
  if (!json) return EXIT_FAILURE;

  *json_string_out = cJSON_PrintUnformatted(json);
  cJSON_Delete(json);
  return *json_string_out ? EXIT_SUCCESS : EXIT_FAILURE;
}

static inline int exercises_store_upsert(const char *path,
                                         const exercises_store_upsert_request_t *request) {
  if (!path || !request || !request->name) return EXIT_FAILURE;

  cJSON *root = cjson_read_from_file(path);
  if (!root) return EXIT_FAILURE;

  int result = EXIT_FAILURE;
  char category_id_value[UUID_STR_LEN] = {0};
  const char *category_id_value_ptr = NULL;
  bool has_category = (request->category_name && strlen(request->category_name) > 0) ||
                      (request->category_id && strlen(request->category_id) > 0);

  if (has_category) {
    if (categories_get_or_create_id(root, request->category_name, request->category_id,
                                    category_id_value, sizeof(category_id_value)) != EXIT_SUCCESS) {
      goto cleanup;
    }
    category_id_value_ptr = category_id_value;
  } else if (!exercises_has_name(root, request->name)) {
    if (categories_get_or_create_id(root, "General", NULL, category_id_value,
                                    sizeof(category_id_value)) != EXIT_SUCCESS) {
      goto cleanup;
    }
    category_id_value_ptr = category_id_value;
  }

  if (exercises_add(root, request->name, request->threshold_percentage, request->type,
                    category_id_value_ptr, request->rep_band) != EXIT_SUCCESS) {
    goto cleanup;
  }

  if (cjson_save_to_file(root, path) != EXIT_SUCCESS) {
    goto cleanup;
  }

  result = EXIT_SUCCESS;

cleanup:
  cJSON_Delete(root);
  return result;
}

static inline int exercises_store_delete(const char *path, const char *name) {
  if (!path || !name) return EXIT_FAILURE;

  cJSON *root = cjson_read_from_file(path);
  if (!root) return EXIT_FAILURE;

  int result = EXIT_FAILURE;

  if (exercises_remove(root, name) != EXIT_SUCCESS) {
    goto cleanup;
  }

  if (cjson_save_to_file(root, path) != EXIT_SUCCESS) {
    goto cleanup;
  }

  result = EXIT_SUCCESS;

cleanup:
  cJSON_Delete(root);
  return result;
}

#endif

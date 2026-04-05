#ifndef SETTINGS_STORE_H
#define SETTINGS_STORE_H

#include "../data/settings.h"
#include "../utils.h"

#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

static inline int settings_store_load_public_json(const char *path, char **json_string_out) {
  if (!path || !json_string_out) return EXIT_FAILURE;

  *json_string_out = NULL;
  cJSON *json = cjson_read_from_file(path);
  if (!json) return EXIT_FAILURE;

  int result = EXIT_FAILURE;
  if (config_sanitize_settings(json) == EXIT_SUCCESS) {
    *json_string_out = cJSON_PrintUnformatted(json);
    if (*json_string_out) {
      result = EXIT_SUCCESS;
    }
  }

  cJSON_Delete(json);
  return result;
}

static inline int settings_store_apply_patch(const char *path, cJSON *patch,
                                             bool *hostname_changed_out,
                                             char *hostname_out, size_t hostname_out_len) {
  if (!path || !patch) return EXIT_FAILURE;

  if (hostname_changed_out) {
    *hostname_changed_out = false;
  }
  if (hostname_out && hostname_out_len > 0) {
    hostname_out[0] = '\0';
  }

  cJSON *settings_json = cjson_read_from_file(path);
  if (!settings_json) return EXIT_FAILURE;

  int result = EXIT_FAILURE;
  char old_hostname[64];
  char new_hostname[64];

  settings_extract_hostname(settings_json, old_hostname, sizeof(old_hostname));

  if (config_change_settings(settings_json, patch) != EXIT_SUCCESS) {
    goto cleanup;
  }

  settings_extract_hostname(settings_json, new_hostname, sizeof(new_hostname));

  if (cjson_save_to_file(settings_json, path) != EXIT_SUCCESS) {
    goto cleanup;
  }

  if (hostname_changed_out) {
    *hostname_changed_out = strcmp(old_hostname, new_hostname) != 0;
  }
  if (hostname_out && hostname_out_len > 0) {
    strncpy(hostname_out, new_hostname, hostname_out_len);
    hostname_out[hostname_out_len - 1] = '\0';
  }

  result = EXIT_SUCCESS;

cleanup:
  cJSON_Delete(settings_json);
  return result;
}

#endif

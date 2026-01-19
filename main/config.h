#ifndef CONFIG_H
#define CONFIG_H

#include <cJSON.h>
#include <string.h>

typedef enum { EXERCISE_SINGULAR, EXERCISE_ALTERNATING, EXERCISE_UNKNOWN } exercise_type_t;

typedef struct {
  const char *ssid;
  const char *password;
  const char *hostname;
} wifi_settings_t;

typedef struct {
  bool strict_mode;
  int auto_complete_secs;
} app_settings_t;

typedef struct {
  wifi_settings_t wifi;
  app_settings_t app;
} config_settings_t;

static const char *exercise_type_to_string(exercise_type_t type) {
  switch (type) {
  case EXERCISE_SINGULAR:
    return "singular";
  case EXERCISE_ALTERNATING:
    return "alternating";
  default:
    return "unknown";
  }
}

static exercise_type_t exercise_type_from_string(const char *type) {
  if (strcmp(type, "singular") == 0) {
    return EXERCISE_SINGULAR;
  }
  if (strcmp(type, "alternating") == 0) {
    return EXERCISE_ALTERNATING;
  }
  return EXERCISE_UNKNOWN;
}

cJSON *exercises_create_root(void) {
  cJSON *root = cJSON_CreateObject();
  if (root == NULL) {
    return NULL;
  }

  if (cJSON_AddArrayToObject(root, "exercises") == NULL) {
    cJSON_Delete(root);
    return NULL;
  }

  return root;
}

char *read_file_to_string(const char *path) {
  FILE *file = fopen(path, "rb");
  char *buffer = NULL;
  long length = 0;

  if (file == NULL) {
    return NULL;
  }

  fseek(file, 0, SEEK_END);
  length = ftell(file);
  rewind(file);

  buffer = malloc(length + 1);
  if (buffer == NULL) {
    fclose(file);
    return NULL;
  }

  if (fread(buffer, 1, length, file) != (size_t) length) {
    fclose(file);
    free(buffer);
    return NULL;
  }

  buffer[length] = '\0';
  fclose(file);
  return buffer;
}

cJSON *exercises_load_from_file(const char *path) {
  char *json_string = read_file_to_string(path);
  if (json_string == NULL) {
    return NULL;
  }

  cJSON *root = cJSON_Parse(json_string);
  free(json_string);

  if (root == NULL) {
    const char *error = cJSON_GetErrorPtr();
    if (error != NULL) {
      fprintf(stderr, "JSON parse error before: %s\n", error);
    }
    return NULL;
  }

  return root;
}

int exercises_save_to_file(const cJSON *root, const char *path) {
  char *json_string = cJSON_PrintUnformatted(root);
  if (json_string == NULL) {
    return 0;
  }

  FILE *file = fopen(path, "wb");
  if (file == NULL) {
    free(json_string);
    return 0;
  }

  size_t length = strlen(json_string);
  size_t written = fwrite(json_string, 1, length, file);

  fclose(file);
  free(json_string);

  return written == length;
}

int exercises_add(cJSON *root, const char *name, double thresholdPercentage, exercise_type_t type) {
  cJSON *exercises = cJSON_GetObjectItemCaseSensitive(root, "exercises");
  if (!cJSON_IsArray(exercises)) {
    return 0;
  }

  cJSON *exercise = NULL;
  cJSON_ArrayForEach(exercise, exercises) {
    cJSON *name_item = cJSON_GetObjectItemCaseSensitive(exercise, "name");
    if (cJSON_IsString(name_item) && name_item->valuestring != NULL &&
        strcmp(name_item->valuestring, name) == 0) {
      /* Exercise exists -> update its thresholdPercentage and type */
      cJSON *threshold_item = cJSON_GetObjectItemCaseSensitive(exercise, "thresholdPercentage");
      if (cJSON_IsNumber(threshold_item)) {
        threshold_item->valuedouble = thresholdPercentage;
      } else {
        cJSON_ReplaceItemInObject(exercise, "thresholdPercentage",
                                  cJSON_CreateNumber(thresholdPercentage));
      }

      cJSON *type_item = cJSON_GetObjectItemCaseSensitive(exercise, "type");
      if (cJSON_IsString(type_item)) {
        free(type_item->valuestring);
        type_item->valuestring = strdup(exercise_type_to_string(type));
      } else {
        cJSON_ReplaceItemInObject(exercise, "type",
                                  cJSON_CreateString(exercise_type_to_string(type)));
      }

      return 1; /* Updated existing exercise */
    }
  }

  cJSON *exercise_obj = cJSON_CreateObject();
  if (exercise_obj == NULL) {
    return 0;
  }

  if (cJSON_AddStringToObject(exercise_obj, "name", name) == NULL ||
      cJSON_AddNumberToObject(exercise_obj, "thresholdPercentage", thresholdPercentage) == NULL ||
      cJSON_AddStringToObject(exercise_obj, "type", exercise_type_to_string(type)) == NULL) {
    cJSON_Delete(exercise_obj);
    return 0;
  }

  cJSON_AddItemToArray((cJSON *) exercises, exercise_obj);
  return 1;
}

int exercises_remove(cJSON *root, const char *name) {
  cJSON *exercises = cJSON_GetObjectItemCaseSensitive(root, "exercises");
  if (!cJSON_IsArray(exercises)) {
    return 0;
  }

  cJSON *exercise = NULL;
  int index = 0;

  cJSON_ArrayForEach(exercise, exercises) {
    cJSON *name_item = cJSON_GetObjectItemCaseSensitive(exercise, "name");

    if (cJSON_IsString(name_item) && name_item->valuestring != NULL &&
        strcmp(name_item->valuestring, name) == 0) {
      cJSON_DeleteItemFromArray(exercises, index);
      return 1;
    }

    index++;
  }

  return 0;
}

int config_load_settings(cJSON *root, config_settings_t *settings) {
  /* -------- WIFI -------- */
  const cJSON *wifi = cJSON_GetObjectItemCaseSensitive(root, "wifi");
  if (cJSON_IsObject(wifi)) {
    const cJSON *ssid = cJSON_GetObjectItemCaseSensitive(wifi, "ssid");
    const cJSON *password = cJSON_GetObjectItemCaseSensitive(wifi, "password");
    const cJSON *hostname = cJSON_GetObjectItemCaseSensitive(wifi, "hostname");

    settings->wifi.ssid = cJSON_IsString(ssid) ? ssid->valuestring : NULL;

    settings->wifi.password = cJSON_IsString(password) ? password->valuestring : NULL;

    settings->wifi.hostname = cJSON_IsString(hostname) ? hostname->valuestring : NULL;
  } else {
    settings->wifi.ssid = NULL;
    settings->wifi.password = NULL;
    settings->wifi.hostname = NULL;
  }

  /* -------- APP -------- */
  const cJSON *app = cJSON_GetObjectItemCaseSensitive(root, "app");
  if (cJSON_IsObject(app)) {
    const cJSON *strict = cJSON_GetObjectItemCaseSensitive(app, "strictMode");
    const cJSON *auto_complete = cJSON_GetObjectItemCaseSensitive(app, "autoCompleteSecs");

    settings->app.strict_mode = cJSON_IsBool(strict) ? cJSON_IsTrue(strict) : false;

    settings->app.auto_complete_secs = cJSON_IsNumber(auto_complete) ? auto_complete->valueint : 0;
  } else {
    settings->app.strict_mode = false;
    settings->app.auto_complete_secs = 0;
  }

  return 1;
}

#endif
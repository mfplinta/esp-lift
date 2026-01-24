#ifndef EXERCISES_H
#define EXERCISES_H

#include <cJSON.h>
#include <stdlib.h>
#include <string.h>

typedef enum { EXERCISE_SINGULAR, EXERCISE_ALTERNATING, EXERCISE_UNKNOWN } exercise_type_t;

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

int exercises_add(cJSON *root, const char *name, double thresholdPercentage, exercise_type_t type) {
  cJSON *exercises = cJSON_GetObjectItemCaseSensitive(root, "exercises");
  if (!cJSON_IsArray(exercises)) {
    return EXIT_FAILURE;
  }

  cJSON *exercise = NULL;
  cJSON_ArrayForEach(exercise, exercises) {
    cJSON *name_item = cJSON_GetObjectItemCaseSensitive(exercise, "name");
    if (cJSON_IsString(name_item) && name_item->valuestring &&
        strcmp(name_item->valuestring, name) == 0) {
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

      return EXIT_SUCCESS;
    }
  }

  cJSON *new_exercise = cJSON_CreateObject();
  cJSON_AddStringToObject(new_exercise, "name", name);
  cJSON_AddNumberToObject(new_exercise, "thresholdPercentage", thresholdPercentage);
  cJSON_AddStringToObject(new_exercise, "type", exercise_type_to_string(type));
  cJSON_AddItemToArray(exercises, new_exercise);

  return EXIT_SUCCESS;
}

int exercises_remove(cJSON *root, const char *name) {
  cJSON *exercises = cJSON_GetObjectItemCaseSensitive(root, "exercises");
  if (!cJSON_IsArray(exercises)) {
    return EXIT_FAILURE;
  }

  cJSON *exercise = NULL;
  int index = 0;

  cJSON_ArrayForEach(exercise, exercises) {
    cJSON *name_item = cJSON_GetObjectItemCaseSensitive(exercise, "name");

    if (cJSON_IsString(name_item) && name_item->valuestring != NULL &&
        strcmp(name_item->valuestring, name) == 0) {
      cJSON_DeleteItemFromArray(exercises, index);
      return EXIT_SUCCESS;
    }

    index++;
  }

  return EXIT_SUCCESS;
}

#endif
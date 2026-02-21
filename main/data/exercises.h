#ifndef EXERCISES_H
#define EXERCISES_H

#include <cJSON.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>
#include <uuid.h>

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

static cJSON *ensure_categories_array(cJSON *root) {
  cJSON *categories = cJSON_GetObjectItemCaseSensitive(root, "categories");
  if (!cJSON_IsArray(categories)) {
    if (categories) {
      cJSON_DeleteItemFromObject(root, "categories");
    }
    categories = cJSON_AddArrayToObject(root, "categories");
  }
  return categories;
}

static int categories_get_or_create_id(cJSON *root,
                                       const char *name,
                                       const char *id,
                                       char *out,
                                       size_t out_size) {
  // Only match by id, never by name
  cJSON *categories = ensure_categories_array(root);
  if (!cJSON_IsArray(categories)) {
    return EXIT_FAILURE;
  }

  if (id && strlen(id) > 0) {
    cJSON *category = NULL;
    cJSON_ArrayForEach(category, categories) {
      cJSON *id_item = cJSON_GetObjectItemCaseSensitive(category, "id");
      if (cJSON_IsString(id_item) && strcmp(id_item->valuestring, id) == 0) {
        strncpy(out, id_item->valuestring, out_size - 1);
        out[out_size - 1] = '\0';
        return EXIT_SUCCESS;
      }
    }
  }

  // If not found, create new category
  const char *resolved_name = (name && strlen(name) > 0) ? name : "General";
  uuid_t uu;
  char uu_str[UUID_STR_LEN];
  uuid_generate(uu);
  uuid_unparse(uu, uu_str);

  cJSON *new_category = cJSON_CreateObject();
  cJSON_AddStringToObject(new_category, "id", uu_str);
  cJSON_AddStringToObject(new_category, "name", resolved_name);
  cJSON_AddItemToArray(categories, new_category);

  strncpy(out, uu_str, out_size - 1);
  out[out_size - 1] = '\0';
  return EXIT_SUCCESS;
}

static bool exercises_has_name(cJSON *root, const char *name) {
  cJSON *exercises = cJSON_GetObjectItemCaseSensitive(root, "exercises");
  if (!cJSON_IsArray(exercises)) {
    return false;
  }

  cJSON *exercise = NULL;
  cJSON_ArrayForEach(exercise, exercises) {
    cJSON *name_item = cJSON_GetObjectItemCaseSensitive(exercise, "name");
    if (cJSON_IsString(name_item) && name_item->valuestring &&
        strcmp(name_item->valuestring, name) == 0) {
      return true;
    }
  }

  return false;
}

int exercises_add(cJSON *root,
                  const char *name,
                  double thresholdPercentage,
                  exercise_type_t type,
                  const char *category_id) {
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

      if (category_id && strlen(category_id) > 0) {
        cJSON *category_item = cJSON_GetObjectItemCaseSensitive(exercise, "categoryId");
        if (cJSON_IsString(category_item)) {
          free(category_item->valuestring);
          category_item->valuestring = strdup(category_id);
        } else {
          cJSON_ReplaceItemInObject(exercise, "categoryId",
                                    cJSON_CreateString(category_id));
        }
      }

      return EXIT_SUCCESS;
    }
  }

  cJSON *new_exercise = cJSON_CreateObject();
  cJSON_AddStringToObject(new_exercise, "name", name);
  cJSON_AddNumberToObject(new_exercise, "thresholdPercentage", thresholdPercentage);
  cJSON_AddStringToObject(new_exercise, "type", exercise_type_to_string(type));
  if (category_id && strlen(category_id) > 0) {
    cJSON_AddStringToObject(new_exercise, "categoryId", category_id);
  }
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
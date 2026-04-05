cmake_minimum_required(VERSION 3.16)
set(EXTRA_COMPONENT_DIRS ${CMAKE_CURRENT_LIST_DIR}/backend)
set(COMPONENTS backend)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(esp_lift)

littlefs_create_partition_image(www "./frontend/dist" FLASH_IN_PROJECT)
littlefs_create_partition_image(cfg "./cfg" FLASH_IN_PROJECT)
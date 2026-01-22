cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(esp_lift)

littlefs_create_partition_image(www "./web_app/dist" FLASH_IN_PROJECT)
littlefs_create_partition_image(cfg "./cfg" FLASH_IN_PROJECT)
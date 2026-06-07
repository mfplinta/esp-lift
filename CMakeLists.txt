cmake_minimum_required(VERSION 3.16)
set(EXTRA_COMPONENT_DIRS ${CMAKE_CURRENT_LIST_DIR}/backend)
set(COMPONENTS backend)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)

set(esp_lift_dependencies_lock "")
if(ESP_LIFT_DEPENDENCIES_LOCK)
    set(esp_lift_dependencies_lock "${ESP_LIFT_DEPENDENCIES_LOCK}")
elseif(DEFINED ENV{ESP_LIFT_DEPENDENCIES_LOCK} AND NOT "$ENV{ESP_LIFT_DEPENDENCIES_LOCK}" STREQUAL "")
    set(esp_lift_dependencies_lock "$ENV{ESP_LIFT_DEPENDENCIES_LOCK}")
endif()

if(esp_lift_dependencies_lock)
    get_filename_component(esp_lift_dependencies_lock_dir "${esp_lift_dependencies_lock}" DIRECTORY)
    file(MAKE_DIRECTORY "${esp_lift_dependencies_lock_dir}")

    if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/dependencies.lock" AND NOT EXISTS "${esp_lift_dependencies_lock}")
        configure_file(
            "${CMAKE_CURRENT_LIST_DIR}/dependencies.lock"
            "${esp_lift_dependencies_lock}"
            COPYONLY
        )
    endif()

    idf_build_set_property(DEPENDENCIES_LOCK "${esp_lift_dependencies_lock}")
endif()

project(esp_lift)

find_program(NPM_EXECUTABLE npm)
if(NOT NPM_EXECUTABLE)
    message(FATAL_ERROR "npm is required to build the frontend assets")
endif()

set(frontend_dir "${CMAKE_CURRENT_LIST_DIR}/frontend")
set(frontend_deps_stamp "${CMAKE_BINARY_DIR}/frontend-deps.stamp")
set(frontend_dist_stamp "${CMAKE_BINARY_DIR}/frontend-dist.stamp")

file(GLOB_RECURSE frontend_src_sources CONFIGURE_DEPENDS
    "${frontend_dir}/src/*.css"
    "${frontend_dir}/src/*.ts"
    "${frontend_dir}/src/*.tsx"
)

file(GLOB frontend_public_sources CONFIGURE_DEPENDS
    "${frontend_dir}/public/*"
)

set(frontend_sources
    "${frontend_dir}/index.html"
    "${frontend_dir}/postcss.config.js"
    "${frontend_dir}/tsconfig.json"
    "${frontend_dir}/vite.config.ts"
    ${frontend_public_sources}
    ${frontend_src_sources}
)

add_custom_command(
    OUTPUT "${frontend_deps_stamp}"
    COMMAND "${NPM_EXECUTABLE}" ci
    COMMAND "${CMAKE_COMMAND}" -E touch "${frontend_deps_stamp}"
    WORKING_DIRECTORY "${frontend_dir}"
    DEPENDS
        "${frontend_dir}/package.json"
        "${frontend_dir}/package-lock.json"
    VERBATIM
)

add_custom_target(frontend_deps DEPENDS "${frontend_deps_stamp}")

add_custom_command(
    OUTPUT "${frontend_dist_stamp}"
    COMMAND "${NPM_EXECUTABLE}" run build
    COMMAND "${CMAKE_COMMAND}" -E touch "${frontend_dist_stamp}"
    WORKING_DIRECTORY "${frontend_dir}"
    DEPENDS
        "${frontend_deps_stamp}"
        ${frontend_sources}
    VERBATIM
)

add_custom_target(frontend_dist DEPENDS "${frontend_dist_stamp}")

littlefs_create_partition_image(www "./frontend/dist" FLASH_IN_PROJECT DEPENDS frontend_dist)
littlefs_create_partition_image(cfg "./cfg" FLASH_IN_PROJECT)

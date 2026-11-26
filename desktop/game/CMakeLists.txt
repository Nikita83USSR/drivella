cmake_minimum_required(VERSION 3.21)
project(DrivellaGame LANGUAGES C CXX)

if(NOT DEFINED CEF_ROOT)
  message(FATAL_ERROR "CEF_ROOT must point to an extracted CEF binary distribution.")
endif()

set(CMAKE_MODULE_PATH \${CMAKE_MODULE_PATH} "\${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)
add_subdirectory("\${CEF_LIBCEF_DLL_WRAPPER_PATH}" libcef_dll_wrapper)
SET_CEF_TARGET_OUT_DIR()

add_executable(DrivellaGame WIN32 src/drivella_game.cpp)
SET_EXECUTABLE_TARGET_PROPERTIES(DrivellaGame)
target_compile_features(DrivellaGame PRIVATE cxx_std_20)
target_link_libraries(DrivellaGame libcef_lib libcef_dll_wrapper \${CEF_STANDARD_LIBS} ws2_32 shell32)

COPY_FILES("DrivellaGame" "\${CEF_BINARY_FILES}" "\${CEF_BINARY_DIR}" "\${CEF_TARGET_OUT_DIR}")
COPY_FILES("DrivellaGame" "\${CEF_RESOURCE_FILES}" "\${CEF_RESOURCE_DIR}" "\${CEF_TARGET_OUT_DIR}")

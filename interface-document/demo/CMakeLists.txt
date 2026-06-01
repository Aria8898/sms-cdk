cmake_minimum_required(VERSION 3.10)
project(Demo)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CURL REQUIRED)

add_executable(demo demo.cpp)

target_include_directories(demo PRIVATE ${CURL_INCLUDE_DIRS})
target_link_libraries(demo ${CURL_LIBRARIES})

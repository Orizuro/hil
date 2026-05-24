include("${CMAKE_CURRENT_LIST_DIR}/rule.cmake")
include("${CMAKE_CURRENT_LIST_DIR}/file.cmake")

set(TejoOne_default_library_list )

# Handle files with suffix s, for group default-XC32
if(TejoOne_default_default_XC32_FILE_TYPE_assemble)
add_library(TejoOne_default_default_XC32_assemble OBJECT ${TejoOne_default_default_XC32_FILE_TYPE_assemble})
    TejoOne_default_default_XC32_assemble_rule(TejoOne_default_default_XC32_assemble)
    list(APPEND TejoOne_default_library_list "$<TARGET_OBJECTS:TejoOne_default_default_XC32_assemble>")

endif()

# Handle files with suffix S, for group default-XC32
if(TejoOne_default_default_XC32_FILE_TYPE_assembleWithPreprocess)
add_library(TejoOne_default_default_XC32_assembleWithPreprocess OBJECT ${TejoOne_default_default_XC32_FILE_TYPE_assembleWithPreprocess})
    TejoOne_default_default_XC32_assembleWithPreprocess_rule(TejoOne_default_default_XC32_assembleWithPreprocess)
    list(APPEND TejoOne_default_library_list "$<TARGET_OBJECTS:TejoOne_default_default_XC32_assembleWithPreprocess>")

endif()

# Handle files with suffix [cC], for group default-XC32
if(TejoOne_default_default_XC32_FILE_TYPE_compile)
add_library(TejoOne_default_default_XC32_compile OBJECT ${TejoOne_default_default_XC32_FILE_TYPE_compile})
    TejoOne_default_default_XC32_compile_rule(TejoOne_default_default_XC32_compile)
    list(APPEND TejoOne_default_library_list "$<TARGET_OBJECTS:TejoOne_default_default_XC32_compile>")

endif()

# Handle files with suffix cpp, for group default-XC32
if(TejoOne_default_default_XC32_FILE_TYPE_compile_cpp)
add_library(TejoOne_default_default_XC32_compile_cpp OBJECT ${TejoOne_default_default_XC32_FILE_TYPE_compile_cpp})
    TejoOne_default_default_XC32_compile_cpp_rule(TejoOne_default_default_XC32_compile_cpp)
    list(APPEND TejoOne_default_library_list "$<TARGET_OBJECTS:TejoOne_default_default_XC32_compile_cpp>")

endif()

# Handle files with suffix [cC], for group default-XC32
if(TejoOne_default_default_XC32_FILE_TYPE_dependentObject)
add_library(TejoOne_default_default_XC32_dependentObject OBJECT ${TejoOne_default_default_XC32_FILE_TYPE_dependentObject})
    TejoOne_default_default_XC32_dependentObject_rule(TejoOne_default_default_XC32_dependentObject)
    list(APPEND TejoOne_default_library_list "$<TARGET_OBJECTS:TejoOne_default_default_XC32_dependentObject>")

endif()


# Main target for this project
add_executable(TejoOne_default_image_s_leY22h ${TejoOne_default_library_list})

set_target_properties(TejoOne_default_image_s_leY22h PROPERTIES
    OUTPUT_NAME "default"
    SUFFIX ".elf"
    RUNTIME_OUTPUT_DIRECTORY "${TejoOne_default_output_dir}")
target_link_libraries(TejoOne_default_image_s_leY22h PRIVATE ${TejoOne_default_default_XC32_FILE_TYPE_link})

# Add the link options from the rule file.
TejoOne_default_link_rule( TejoOne_default_image_s_leY22h)

# Add bin2hex target for converting built file to a .hex file.
string(REGEX REPLACE [.]elf$ .hex TejoOne_default_image_name_hex ${TejoOne_default_image_name})
add_custom_target(TejoOne_default_Bin2Hex ALL
    COMMAND ${MP_BIN2HEX} \"${TejoOne_default_output_dir}/${TejoOne_default_image_name}\"
    BYPRODUCTS ${TejoOne_default_output_dir}/${TejoOne_default_image_name_hex}
    COMMENT "Convert built file to .hex")
add_dependencies(TejoOne_default_Bin2Hex TejoOne_default_image_s_leY22h)




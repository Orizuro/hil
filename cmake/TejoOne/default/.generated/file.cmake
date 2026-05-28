# The following variables contains the files used by the different stages of the build process.
set(TejoOne_default_default_XC32_FILE_TYPE_assemble)
set_source_files_properties(${TejoOne_default_default_XC32_FILE_TYPE_assemble} PROPERTIES LANGUAGE ASM)

# For assembly files, add "." to the include path for each file so that .include with a relative path works
foreach(source_file ${TejoOne_default_default_XC32_FILE_TYPE_assemble})
        set_source_files_properties(${source_file} PROPERTIES INCLUDE_DIRECTORIES "$<PATH:NORMAL_PATH,$<PATH:REMOVE_FILENAME,${source_file}>>")
endforeach()

set(TejoOne_default_default_XC32_FILE_TYPE_assembleWithPreprocess)
set_source_files_properties(${TejoOne_default_default_XC32_FILE_TYPE_assembleWithPreprocess} PROPERTIES LANGUAGE ASM)

# For assembly files, add "." to the include path for each file so that .include with a relative path works
foreach(source_file ${TejoOne_default_default_XC32_FILE_TYPE_assembleWithPreprocess})
        set_source_files_properties(${source_file} PROPERTIES INCLUDE_DIRECTORIES "$<PATH:NORMAL_PATH,$<PATH:REMOVE_FILENAME,${source_file}>>")
endforeach()

set(TejoOne_default_default_XC32_FILE_TYPE_compile
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/exceptions.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/initialization.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/interrupts.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/peripheral/clk/plib_clk.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/peripheral/evic/plib_evic.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/peripheral/gpio/plib_gpio.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/peripheral/tmr/plib_tmr2.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/peripheral/uart/plib_uart6.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/stdio/xc32_monitor.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/main.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../tools/vscode-tejoone/node_modules/node-addon-api/nothing.c")
set_source_files_properties(${TejoOne_default_default_XC32_FILE_TYPE_compile} PROPERTIES LANGUAGE C)
set(TejoOne_default_default_XC32_FILE_TYPE_compile_cpp)
set_source_files_properties(${TejoOne_default_default_XC32_FILE_TYPE_compile_cpp} PROPERTIES LANGUAGE CXX)
set(TejoOne_default_default_XC32_FILE_TYPE_link)

# The linker script used for the build.
set(TejoOne_default_LINKER_SCRIPT "${CMAKE_CURRENT_SOURCE_DIR}/../../../My_MCC_Config/src/config/default/p32MZ2048EFM144.ld")
set(TejoOne_default_image_name "default.elf")
set(TejoOne_default_image_base_name "default")

# The output directory of the final image.
set(TejoOne_default_output_dir "${CMAKE_CURRENT_SOURCE_DIR}/../../../out/TejoOne")

# The full path to the final image.
set(TejoOne_default_full_path_to_image ${TejoOne_default_output_dir}/${TejoOne_default_image_name})

use std::io::Result;

fn main() -> Result<()> {
    // Tell Cargo that if the given file changes, to rerun this build script.
    println!("cargo:rerun-if-changed=../src/parser/svga.proto");

    prost_build::Config::new()
        // Output directory for generated Rust files.
        // This directory will be within the `OUT_DIR` environment variable,
        // which `prost` uses by default if `out_dir` is not specified.
        // We will include the generated code using `include!(concat!(env!("OUT_DIR"), "/com.opensource.svga.rs"));`
        // in lib.rs, so setting a specific out_dir within src/ is not strictly necessary
        // unless we want to inspect the generated files easily or commit them (not usually recommended).
        // For this setup, we'll let prost use its default within OUT_DIR.
        // .out_dir("src/protos") // Example if we wanted to output to src/protos

        // Specify the .proto files to compile and their include paths.
        // The path to svga.proto should be relative to this build.rs file (crate root).
        // The include path is where prost will look for any imported .proto files (if svga.proto had imports).
        .compile_protos(&["../src/parser/svga.proto"], &["../src/parser/"])?;
        // Note: The path "../src/parser/svga.proto" assumes that the svga_wasm_parser crate
        // is a direct sibling of the main "src" directory of the SVGAPlayer-Web-Lite project.
        // If svga_wasm_parser is, for example, inside SVGAPlayer-Web-Lite/svga_wasm_parser/,
        // then the path might be "./../src/parser/svga.proto" or adjusted accordingly.
        // For now, assuming the former structure based on typical project layouts.
        // If this `build.rs` is at the root of `svga_wasm_parser` and `svga.proto` is in
        // `SVGAPlayer-Web-Lite/src/parser/svga.proto`, and `svga_wasm_parser` is a sibling
        // to `SVGAPlayer-Web-Lite`, then the path needs to be `../SVGAPlayer-Web-Lite/src/parser/svga.proto`.
        // Given the prompt "src/parser/svga.proto", it implies it's relative to the *overall* project root.
        // Let's assume the crate `svga_wasm_parser` is *inside* the main project root.
        // So, if `svga_wasm_parser` is at the root of the main project:
        // Then `svga.proto` is at `src/parser/svga.proto`.
        // So, from `svga_wasm_parser/build.rs`, the path would be `../src/parser/svga.proto`.
        // This was the original assumption and seems correct.

    Ok(())
}

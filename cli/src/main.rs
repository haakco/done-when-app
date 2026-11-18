use std::io;
use std::process::ExitCode;

use clap::Parser;

fn main() -> ExitCode {
    let cli = done_when::cli::Cli::parse();
    let Some(config_dir) = done_when::store::default_config_dir() else {
        eprintln!("done-when: no home or config directory is set");
        return ExitCode::FAILURE;
    };
    let code = done_when::cli::execute(
        cli,
        config_dir,
        &mut io::stdin().lock(),
        &mut io::stdout().lock(),
        &mut io::stderr().lock(),
    );
    ExitCode::from(code as u8)
}

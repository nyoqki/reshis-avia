import re

import pytest

from rehis.cli import main

CYRILLIC = re.compile("[\u0400-\u04ff]")


def test_forecast_prints_seats_wishing_and_buying_for_moscow_sochi(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = main(["--to", "Сочи", "--date", "2026-06-12", "--price", "9000"])

    captured = capsys.readouterr()
    lines = captured.out.splitlines()
    assert code == 0
    assert "Мест: 900" in lines
    assert "Желают: 970" in lines
    assert "Купят: 900" in lines
    assert "Свободно: 0" in lines
    assert captured.err == ""


def test_explicit_origin_matches_the_default(capsys: pytest.CaptureFixture[str]) -> None:
    args = ["--to", "Сочи", "--date", "2026-06-12", "--price", "9000"]
    assert main(args) == 0
    default_out = capsys.readouterr().out

    assert main(["--from", "Москва", *args]) == 0
    assert capsys.readouterr().out == default_out


@pytest.mark.parametrize(
    "argv",
    [
        ["--from", "Сочи", "--to", "Москва", "--date", "2026-06-12", "--price", "9000"],
        ["--to", "Сочи", "--date", "2030-01-01", "--price", "9000"],
        ["--to", "Сочи", "--date", "2026-06-12", "--price", "0"],
    ],
    ids=["reverse-direction", "date-outside-range", "price-zero"],
)
def test_invalid_input_returns_2_with_russian_stderr_message(
    argv: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    code = main(argv)

    captured = capsys.readouterr()
    assert code == 2
    assert CYRILLIC.search(captured.err)
    assert captured.out == ""

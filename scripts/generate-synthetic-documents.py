#!/usr/bin/env python3
"""Generate visibly synthetic, source-like PDF fixtures and refresh manifests."""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = ROOT / "data" / "synthetic" / "scenarios"
RED = colors.HexColor("#C8102E")
INK = colors.HexColor("#17212B")
MUTED = colors.HexColor("#5C6670")
PALE = colors.HexColor("#F3F5F7")
BLUE = colors.HexColor("#002664")
BANK_NAME = "Nick's Bank"
STATE_NAME = "Freddie State"


def load(path: Path):
    return json.loads(path.read_text())


def money(value: str | Decimal) -> str:
    return f"${Decimal(value):,.2f}"


def date_label(value: str) -> str:
    return datetime.strptime(value, "%Y-%m-%d").strftime("%d %b %Y")


def pdf_canvas(path: Path, pagesize=A4) -> canvas.Canvas:
    c = canvas.Canvas(str(path), pagesize=pagesize, pageCompression=1, invariant=1)
    c.setAuthor("NewCredit synthetic fixture generator")
    c.setCreator("NewCredit synthetic fixture generator")
    c.setTitle("Synthetic demonstration document — not valid")
    c.setSubject("Deliberately synthetic test fixture")
    return c


def synthetic_banner(c: canvas.Canvas, width: float, height: float, text: str) -> None:
    c.saveState()
    c.setFillColor(colors.HexColor("#FFF1F2"))
    c.rect(0, height - 25, width, 25, fill=1, stroke=0)
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(width / 2, height - 16, text)
    c.restoreState()


def write_fit(c: canvas.Canvas, text: str, x: float, y: float, max_width: float,
              font: str = "Helvetica", size: float = 8) -> None:
    while size > 5.5 and stringWidth(text, font, size) > max_width:
        size -= 0.5
    c.setFont(font, size)
    c.drawString(x, y, text)


def draw_licence(base: Path, customer: dict, unreadable_fields: set[str]) -> None:
    path = base / "documents" / "drivers-licence.pdf"
    width, height = landscape((500, 315))
    c = pdf_canvas(path, (width, height))
    c.setFillColor(colors.HexColor("#EAF5FA"))
    c.roundRect(10, 10, width - 20, height - 20, 14, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.rect(10, height - 76, width - 20, 66, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(28, height - 42, f"{STATE_NAME.upper()} DRIVER LICENCE")
    c.setFont("Helvetica-Bold", 8)
    c.drawString(29, height - 61, "SPECIMEN • DEMONSTRATION")

    c.setFillColor(colors.HexColor("#CBD5DF"))
    c.roundRect(28, 62, 112, 142, 8, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#7A8793"))
    c.circle(84, 160, 30, fill=1, stroke=0)
    c.roundRect(51, 78, 66, 60, 28, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(84, 48, "SYNTHETIC PORTRAIT")

    name = customer["legal_name"]
    address = customer["residential_address"]
    fields = [
        ("FAMILY NAME", name["family"].upper(), 170, 210, 280),
        ("GIVEN NAME", name["given"].upper(), 170, 168, 280),
        ("LICENCE NO.", customer["licence_number"], 170, 126, 280),
        ("DATE OF BIRTH", date_label(customer["date_of_birth"]), 170, 84, 130),
        ("EXPIRY", date_label(customer["licence_expiry"]), 330, 84, 120),
        ("ADDRESS", f'{address["line1"]}, {address["suburb"]} {address["state"]} {address["postcode"]}', 170, 45, 280),
    ]
    for label, value, x, y, max_width in fields:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(x, y, label)
        c.setFillColor(INK)
        if label == "LICENCE NO." and "licence_number" in unreadable_fields:
            c.setFillColor(colors.HexColor("#66717C"))
            c.roundRect(x, y - 19, 132, 18, 2, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 7)
            c.drawCentredString(x + 66, y - 14, "DELIBERATELY UNREADABLE")
        else:
            write_fit(c, value, x, y - 15, max_width, "Helvetica-Bold", 10)

    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(width / 2, 20, "NOT A GOVERNMENT DOCUMENT • NO OFFICIAL MARKS • NOT VALID FOR IDENTIFICATION")
    c.showPage()
    c.save()


def statement_opening(rows: list[dict]) -> Decimal:
    first = rows[0]
    after = Decimal(first["balance_after"])
    amount = Decimal(first["amount"])
    return after - amount if first["direction"] == "credit" else after + amount


def draw_statement(path: Path, customer: dict, account: dict, rows: list[dict],
                   period_start: str, period_end: str) -> None:
    width, height = A4
    c = pdf_canvas(path)
    synthetic_banner(c, width, height, f"SYNTHETIC DEMONSTRATION • NOT ISSUED BY A REAL BANK • NO BANKING VALUE")
    c.setFillColor(BLUE)
    c.rect(36, height - 92, 74, 42, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(73, height - 75, "NICK'S")
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(73, height - 87, "BANK")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(128, height - 68, "Transaction account statement")
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(128, height - 84, "Source-like synthetic layout for NewCredit testing")

    display_name = customer["legal_name"]["display"].upper()
    address = customer["residential_address"]
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(36, height - 125, display_name)
    c.setFont("Helvetica", 8)
    c.drawString(36, height - 139, address["line1"])
    c.drawString(36, height - 151, f'{address["suburb"]} {address["state"]} {address["postcode"]}')

    summary_x = 325
    c.setFont("Helvetica-Bold", 8)
    c.drawString(summary_x, height - 120, "Statement period")
    c.setFont("Helvetica", 8)
    c.drawString(summary_x, height - 133, f"{date_label(period_start)} – {date_label(period_end)}")
    c.setFont("Helvetica-Bold", 8)
    c.drawString(summary_x, height - 149, "BSB / account")
    c.setFont("Helvetica", 8)
    c.drawString(summary_x, height - 162, f'{account["bsb_masked"]}  {account["account_masked"]}')

    opening = statement_opening(rows)
    closing = Decimal(rows[-1]["balance_after"])
    c.setFillColor(PALE)
    c.roundRect(36, height - 220, width - 72, 38, 5, fill=1, stroke=0)
    for x, label, value in [
        (50, "Opening balance", money(opening)),
        (220, "Money in", money(sum(Decimal(r["amount"]) for r in rows if r["direction"] == "credit"))),
        (350, "Money out", money(sum(Decimal(r["amount"]) for r in rows if r["direction"] == "debit"))),
        (470, "Closing balance", money(closing)),
    ]:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(x, height - 197, label.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x, height - 212, value)

    y = height - 250
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(36, y, "DATE")
    c.drawString(92, y, "DESCRIPTION")
    c.drawRightString(420, y, "DEBIT")
    c.drawRightString(485, y, "CREDIT")
    c.drawRightString(559, y, "BALANCE")
    y -= 9
    c.setStrokeColor(colors.HexColor("#CBD2D9"))
    c.line(36, y, 559, y)
    for row in rows:
        y -= 20
        c.setFillColor(INK)
        c.setFont("Helvetica", 7)
        c.drawString(36, y, datetime.strptime(row["posted_date"], "%Y-%m-%d").strftime("%d %b"))
        write_fit(c, row["raw_description"], 92, y, 250, size=7)
        value = money(row["amount"])
        c.drawRightString(420 if row["direction"] == "debit" else 485, y, value)
        c.drawRightString(559, y, money(row["balance_after"]))
        c.setStrokeColor(colors.HexColor("#E6E9EC"))
        c.line(36, y - 7, 559, y - 7)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.5)
    c.drawString(36, 34, f"{BANK_NAME} is a fictional institution. This source-like fixture has no banking value.")
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(559, 34, "SYNTHETIC FIXTURE • PAGE 1 OF 1")
    c.showPage()
    c.save()


def draw_payslip(path: Path, customer: dict, employment: dict, pay_date: str,
                 gross: Decimal, net: Decimal, sequence: int) -> None:
    width, height = A4
    c = pdf_canvas(path)
    employer = employment["employer"]
    synthetic_banner(c, width, height, f"UNOFFICIAL SYNTHETIC DEMONSTRATION • NOT ISSUED BY {employer.upper()}")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(40, height - 72, employer)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(40, height - 88, "ASX 100 COMPANY • NAME USED FOR DEMONSTRATION CONTEXT ONLY")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(width - 40, height - 72, "PAYSLIP")

    period_days = 13 if employment["pay_frequency"] == "fortnightly" else 6
    end = date.fromisoformat(pay_date)
    start = end - timedelta(days=period_days)
    details = [
        ("Employee", customer["legal_name"]["display"]),
        ("Employee ID", employment["employment_id"]),
        ("Pay period", f'{start.strftime("%d %b %Y")} – {end.strftime("%d %b %Y")}'),
        ("Pay date", end.strftime("%d %b %Y")),
        ("Employment", employment["employment_status"].replace("_", " ").title()),
        ("Pay frequency", employment["pay_frequency"].title()),
    ]
    y = height - 130
    for index, (label, value) in enumerate(details):
        x = 40 if index % 2 == 0 else 310
        if index % 2 == 0 and index:
            y -= 42
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x, y, label.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        c.drawString(x, y - 15, value)

    y -= 70
    c.setFillColor(PALE)
    c.rect(40, y, width - 80, 28, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(50, y + 10, "EARNINGS")
    c.drawRightString(width - 50, y + 10, "CURRENT")
    y -= 28
    c.setFont("Helvetica", 9)
    c.drawString(50, y + 8, "Ordinary earnings")
    c.drawRightString(width - 50, y + 8, money(gross))
    y -= 36
    tax = gross - net
    c.setFillColor(PALE)
    c.rect(40, y, width - 80, 28, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(50, y + 10, "DEDUCTIONS")
    c.drawRightString(width - 50, y + 10, "CURRENT")
    y -= 28
    c.setFont("Helvetica", 9)
    c.drawString(50, y + 8, "PAYG withholding (synthetic)")
    c.drawRightString(width - 50, y + 8, money(tax))

    super_amount = (gross * Decimal("0.12")).quantize(Decimal("0.01"))
    c.setFillColor(PALE)
    c.roundRect(40, 360, width - 80, 82, 6, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(55, 417, "GROSS PAY")
    c.drawString(220, 417, "NET PAY")
    c.drawString(385, 417, "EMPLOYER SUPER")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(55, 390, money(gross))
    c.drawString(220, 390, money(net))
    c.drawString(385, 390, money(super_amount))

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, 320, "PAYMENT DETAILS")
    c.setFont("Helvetica", 8)
    c.drawString(40, 301, f'Electronic funds transfer to {customer["legal_name"]["display"]}')
    c.drawString(40, 286, f"Synthetic pay reference: {employment['employment_id']}-{sequence:02d}")
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(width / 2, 112, "THIS IS A SYNTHETIC TEST FIXTURE — IT IS NOT PROOF OF EMPLOYMENT OR INCOME")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawCentredString(width / 2, 92, f"{employer} did not produce, endorse, or issue this document.")
    c.showPage()
    c.save()


def refresh_manifest(base: Path, employment: dict) -> None:
    path = base / "documents" / "manifest.json"
    manifest = load(path)
    for item in manifest["documents"]:
        if item["document_type"] == "bank_statement":
            item["stated_issuer"] = f"{BANK_NAME} (fictional)"
        elif item["document_type"] == "drivers_licence":
            item["stated_issuer"] = f"{STATE_NAME} Transport Authority (fictional)"
        elif item["document_type"] == "payslip":
            item["stated_issuer"] = f'{employment["employer"]} (unofficial synthetic fixture)'
        pdf = base / item["file"]
        item["content_hash"] = f"sha256:{hashlib.sha256(pdf.read_bytes()).hexdigest()}"
    path.write_text(json.dumps(manifest, indent=2) + "\n")


def generate_scenario(base: Path) -> None:
    customer = load(base / "canonical" / "customer.json")
    employment = load(base / "canonical" / "employment.json")
    accounts = {item["account_id"]: item for item in load(base / "canonical" / "accounts.json")["accounts"]}
    manifest = load(base / "documents" / "manifest.json")
    with (base / "transactions" / "normalized.csv").open(newline="") as file:
        transactions = list(csv.DictReader(file))

    checks = load(base / "documents" / "check-results.json")["results"]
    unreadable_fields = {
        result["field_name"]
        for result in checks
        if result.get("check") == "field_readability"
        and result.get("status") == "needs_review"
    }
    if customer["licence_number"]:
        draw_licence(base, customer, unreadable_fields)

    statement_items = [item for item in manifest["documents"] if item["document_type"] == "bank_statement"]
    for item in statement_items:
        rows = [row for row in transactions if row["source_document_id"] == item["document_id"]]
        if not rows:
            raise ValueError(f'No transactions for {item["document_id"]}')
        draw_statement(base / item["file"], customer, accounts[rows[0]["account_id"]], rows,
                       item["period_start"], item["period_end"])

    pay_items = [item for item in manifest["documents"] if item["document_type"] == "payslip"]
    extracted = load(base / "documents" / "extracted-fields.json")["fields"]
    for sequence, item in enumerate(pay_items, 1):
        values = {field["field_name"]: Decimal(field["normalized_value"])
                  for field in extracted if field["document_id"] == item["document_id"]}
        draw_payslip(base / item["file"], customer, employment, item["period_end"],
                     values["gross_pay"], values["net_pay"], sequence)
    refresh_manifest(base, employment)


def main() -> None:
    for name in ("scenario-a", "scenario-b", "scenario-c"):
        generate_scenario(SCENARIOS / name)
    print("Generated synthetic documents and refreshed manifest hashes.")


if __name__ == "__main__":
    main()

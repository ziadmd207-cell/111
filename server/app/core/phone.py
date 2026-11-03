import re
import unicodedata


PHONE_COUNTRIES = {
    "EG": ("20", re.compile(r"^1[0125]\d{8}$")),
    "SA": ("966", re.compile(r"^5\d{8}$")),
    "AE": ("971", re.compile(r"^5\d{8}$")),
    "BH": ("973", re.compile(r"^[36]\d{7}$")),
    "KW": ("965", re.compile(r"^[4569]\d{7}$")),
    "OM": ("968", re.compile(r"^[79]\d{7}$")),
    "QA": ("974", re.compile(r"^[3567]\d{7}$")),
}


def normalize_phone(country: str, number: str) -> dict[str, str]:
    country = str(country or "").strip().upper()
    if country not in PHONE_COUNTRIES:
        raise ValueError("اختر دولة مدعومة.")

    raw_number = unicodedata.normalize("NFKC", str(number or ""))
    digits = "".join(str(unicodedata.digit(char)) for char in raw_number if char.isdigit())
    compact = re.sub(r"[\s().-]", "", raw_number)
    if not digits or re.sub(r"[\d\s().-]", "", compact):
        raise ValueError("رقم الهاتف يجب أن يحتوي على أرقام فقط.")

    country_code, pattern = PHONE_COUNTRIES[country]
    if not pattern.fullmatch(digits):
        raise ValueError("رقم الهاتف غير صحيح أو لا يطابق عدد أرقام الدولة المختارة.")

    return {
        "phone_country": country,
        "phone_country_code": country_code,
        "phone_number": digits,
        "phone_e164": f"+{country_code}{digits}",
    }

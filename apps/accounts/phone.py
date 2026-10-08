import re


def normalize_phone(raw: str) -> str:
    """Телефон в международный формат: «8 701 123-45-67», «+7 (701) 123 45 67», «7011234567» → «+77011234567».

    Номера Казахстана и России (код 7): ведущая 8 заменяется на +7, десять цифр без кода — дополняются +7.
    Остальные — как ввели, только цифры с «+». Проверку формата делает валидатор модели.
    """
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits[0] in "78":
        return "+7" + digits[1:]
    if len(digits) == 10 and not raw.strip().startswith("+"):
        return "+7" + digits
    return "+" + digits if digits else ""

from django import template

register = template.Library()


@register.filter
def ru_plural(count, forms: str) -> str:
    """{{ n|ru_plural:"шаг,шага,шагов" }} → «1 шаг», «3 шага», «11 шагов»."""
    one, few, many = forms.split(",")
    n = abs(int(count))
    if n % 10 == 1 and n % 100 != 11:
        form = one
    elif 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        form = few
    else:
        form = many
    return f"{count} {form}"

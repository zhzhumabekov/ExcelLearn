import json
import re

import pytest
from django.urls import reverse

from apps.core.templatetags.ru import ru_plural
from lessons.registry import get_registry


def lesson_json(html: str) -> dict:
    match = re.search(r'<script id="lesson-data" type="application/json">(.*?)</script>', html, re.S)
    assert match, "на странице нет данных урока"
    return json.loads(match.group(1))


def test_home_links_to_first_lesson_and_course(client):
    html = client.get(reverse("catalog:home")).content.decode()

    assert reverse("catalog:lesson", args=["sum-and-autofill"]) in html
    assert reverse("catalog:course") in html
    registry = get_registry()
    chapters = ru_plural(len(registry.chapters), "глава,главы,глав")
    lessons = ru_plural(len(registry.lessons), "урок,урока,уроков")
    assert f"{chapters} · {lessons}" in html


def test_course_lists_chapters_and_lessons_in_book_order(client):
    html = client.get(reverse("catalog:course")).content.decode()

    assert html.index("Введение") < html.index("Основы моделирования в электронных таблицах")
    assert html.index("Функция СУММ и автозаполнение") < html.index("Расчёт недельной платёжной ведомости")
    assert "1.1" in html and "10 шагов" in html and "9 шагов" in html


def test_lesson_page_embeds_player_with_lesson_data(client):
    response = client.get(reverse("catalog:lesson", args=["wages-weekly-salary"]))

    assert response.status_code == 200
    html = response.content.decode()
    assert lesson_json(html)["id"] == "wages-weekly-salary"
    assert "player/player.js" in html and "player/player.css" in html
    assert "Глава 1. Основы моделирования" in html


def test_lesson_neighbors_across_chapters(client):
    def page(lesson_id):
        return client.get(reverse("catalog:lesson", args=[lesson_id])).content.decode()

    first, second, last = page("sum-and-autofill"), page("wages-weekly-salary"), page(get_registry().lessons[-1].id)

    assert 'rel="prev"' not in first
    assert 'rel="next"' in first and reverse("catalog:lesson", args=["wages-weekly-salary"]) in first  # 0.1 → 1.1
    assert 'rel="prev"' in second and reverse("catalog:lesson", args=["bakery-supplier-payments"]) in second
    assert 'rel="prev"' in last and 'rel="next"' not in last


def test_unknown_lesson_is_404(client):
    assert client.get(reverse("catalog:lesson", args=["no-such-lesson"])).status_code == 404


def test_header_links_to_course(client):
    assert f'href="{reverse("catalog:course")}"' in client.get(reverse("catalog:home")).content.decode()


@pytest.mark.parametrize(
    ("n", "text"),
    [
        (1, "1 шаг"),
        (2, "2 шага"),
        (4, "4 шага"),
        (5, "5 шагов"),
        (11, "11 шагов"),
        (12, "12 шагов"),
        (21, "21 шаг"),
        (22, "22 шага"),
        (0, "0 шагов"),
    ],
)
def test_ru_plural(n, text):
    assert ru_plural(n, "шаг,шага,шагов") == text

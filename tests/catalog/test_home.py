from django.urls import reverse


def test_home_renders(client):
    response = client.get(reverse("catalog:home"))

    assert response.status_code == 200
    assert "ExcelLearn" in response.content.decode()

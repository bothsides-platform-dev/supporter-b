# 운영 솔루션 로고 출처

2026-10-15 각 서비스의 공식 사이트가 사용하는 자산을 내려받았다. `/quote-start`의 운영 솔루션 선택지를 식별하는 용도로만 쓰며, 제휴·추천·공식 승인을 뜻하지 않는다. 이름 라벨은 이미지와 독립적으로 항상 표시한다.

| 로컬 파일 | 공식 페이지 | 원본 자산 |
|---|---|---|
| `cafe24.png` | https://www.cafe24corp.com/ | https://img.cafe24.com/favicon/cafe24.ico |
| `imweb.svg` | https://imweb.me/ | https://static-v2.imweb.me/io/images/imweb_symbol_logo_large.svg |
| `makeshop.png` | https://www.makeshop.co.kr/newmakeshop/home/ | https://www.makeshop.co.kr/newmakeshop/home/img/common/makeshop_favicon.ico |
| `godo.png` | https://www.godo.co.kr | https://img.cdn-nhncommerce.com/renewal_2025/homepage/logo/logo_godomall.png |

카페24는 ICO에 포함된 256×256 PNG 바이트를 그대로 추출했다. 메이크샵 원본은 확장자가 ICO지만 실제 형식은 PNG여서 바이트를 그대로 보관했다. 아임웹·고도몰도 원본 그대로다. 비율·색·형태를 수정하지 않고 32px 영역 안에 `object-fit: contain`으로 표시한다. 아임웹의 검은 심볼은 흰 바탕, 고도몰의 흰 워드마크는 어두운 바탕을 유지한다.

자산과 상표의 권리는 각 서비스에 있다. 공식 사이트에서 확인한 자산이며 별도의 재배포 라이선스를 주장하지 않는다. 사용 제한이나 교체 요청을 확인하면 해당 `SOLUTION_LOGOS` 매핑과 자산을 제거하고 이름 선택지를 유지한다.

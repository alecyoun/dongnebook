// 데모의 처음 상태: 체험용 계정 3개와 예시 판매글. 매일 새벽 이 상태로 되돌립니다.
// 비밀번호 해시는 scripts/build-seed.mjs 가 만들어 src/seed.js 에 넣습니다.
export const DEMO_PASSWORD = 'demo1234';

export const USERS = [
  { id: 1, username: 'yeoksam', nickname: '역삼이웃', region: '역삼동', email: 'yeoksam@example.com' },
  { id: 2, username: 'samsung', nickname: '삼성이웃', region: '삼성동', email: 'samsung@example.com' },
  { id: 3, username: 'daechi', nickname: '대치이웃', region: '대치동', email: 'daechi@example.com' },
];

// ago: 지금부터 몇 분 전에 올린 글로 만들지
export const PRODUCTS = [
  { name: '무선 키보드', price: 35000, img: 'keyboard', region: '역삼동', status: '판매중', seller: 1, category: '디지털기기', ago: 25, description: '블루투스와 USB 수신기로 연결하는 텐키리스 무선 키보드입니다.' },
  { name: '원목 의자', price: 35000, img: 'chair', region: '역삼동', status: '판매중', seller: 1, category: '가구/인테리어', ago: 70, description: '튼튼한 원목으로 만든 식탁 의자입니다. 가격을 내렸습니다.' },
  { name: '전기 포트', price: 20000, img: 'kettle', region: '역삼동', status: '예약중', seller: 1, category: '생활/주방', ago: 130, description: '1.7리터 용량의 스테인리스 전기 포트입니다.' },
  { name: 'LED 책상 스탠드', price: 18000, img: 'lamp', region: '역삼동', status: '판매중', seller: 1, category: '가구/인테리어', ago: 200, description: '밝기를 3단계로 조절할 수 있는 LED 책상 스탠드입니다.' },
  { name: '머그컵 2개 세트', price: 8000, img: 'mugs', region: '역삼동', status: '판매중', seller: 1, category: '생활/주방', ago: 320, description: '도자기로 만든 머그컵 두 개 세트입니다.' },
  { name: '백팩', price: 25000, img: 'backpack', region: '삼성동', status: '판매중', seller: 2, category: '의류/잡화', ago: 45, description: '노트북 수납칸이 있는 생활 방수 백팩입니다.' },
  { name: '화분(몬스테라)', price: 12000, img: 'plant', region: '역삼동', status: '거래완료', seller: 1, category: '가구/인테리어', ago: 1500, description: '잎이 풍성하게 자란 몬스테라 화분입니다.' },
  { name: '소설책 5권 묶음', price: 10000, img: 'books', region: '삼성동', status: '판매중', seller: 2, category: '도서', ago: 160, description: '한 번씩 읽은 장편 소설책 다섯 권 묶음입니다.' },
  { name: '장우산', price: 7000, img: 'umbrella', region: '역삼동', status: '판매중', seller: 1, category: '생활/주방', ago: 400, description: '버튼을 누르면 펼쳐지는 튼튼한 자동 장우산입니다.' },
  { name: '블루투스 스피커', price: 25000, img: 'speaker', region: '삼성동', status: '판매중', seller: 2, category: '디지털기기', ago: 260, description: '작지만 소리가 풍부한 휴대용 블루투스 스피커입니다.' },
  { name: '탁상 시계', price: 9000, img: 'clock', region: '역삼동', status: '판매중', seller: 1, category: '가구/인테리어', ago: 15, description: '건전지로 움직이는 탁상 시계입니다. 소리가 조용해서 침실에 두기 좋아요.' },
  { name: '무선 마우스', price: 12000, img: 'mouse', region: '대치동', status: '판매중', seller: 3, category: '디지털기기', ago: 35, description: '조용한 클릭의 무선 마우스입니다. 수신기와 함께 드려요.' },
  { name: '민트색 미니 키보드', price: 30000, img: 'mint-keyboard', region: '대치동', status: '예약중', seller: 3, category: '디지털기기', ago: 180, description: '책상이 좁을 때 쓰기 좋은 작은 키보드입니다. 색이 산뜻해요.' },
  { name: '파스텔 키캡 세트', price: 15000, img: 'keycaps', region: '논현동', status: '판매중', seller: 3, category: '디지털기기', ago: 90, description: '파스텔 색 키캡 세트입니다. 키보드 분위기를 바꾸고 싶을 때 좋아요.' },
  { name: '원목 손목 받침대', price: 8000, img: 'wristrest', region: '청담동', status: '판매중', seller: 2, category: '디지털기기', ago: 240, description: '키보드 앞에 두는 원목 손목 받침대입니다.' },
  { name: '우드 키보드', price: 45000, img: 'wood-keyboard', region: '논현동', status: '판매중', seller: 1, category: '디지털기기', ago: 600, description: '나무 테두리가 멋진 키보드입니다. 인테리어 소품으로도 좋아요.' },
];

export interface ProductType {
    cartItemId? : number,       // 장바구니 행 고유 ID (커스텀 디자인 구분용)
    productId : number,         // Id
    name : string,              // 이름
    price : number,             // 기본 단가
    stockQuantity : number,             // 재고수
    quantity : number,          // 담은 수량
    thumbnailUrl : string | undefined,      // 이미지 주소
    partType : string,          // 카테고리 분류
    additionalPrice : number,   // 옵션 추가 금액
    customBuildId : number,     // 커스텀 키보드 세트 ID
    buildName : string,         // 완제품 이름
    includeAssembly : boolean   // 조립 대행 공임비 포함 여부
    customDesignData? : string  // 커스텀 키캡 디자인 JSON
}

export interface ProductList {
    product : ProductType;
}
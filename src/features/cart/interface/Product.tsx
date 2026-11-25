export interface ProductType {
    cartItemId? : number,        // cart_item 테이블 PK
    productId : number,         // Id
    name : string,              // 이름
    price : number,             // 기본 단가
    stockQuantity : number,             // 재고수
    quantity : number,          // 담은 수량
    thumbnailUrl : string | undefined,      // 이미지 주소
    partType : string,          // 카테고리 분류
    additionalPrice : number,   // 옵션 추가 금액
    customBuildId : number,     // 커스텀 빌드 외래키 (manual_build_id 또는 auto_build_id)
    manualBuildId? : number,    // manual_build 테이블 외래키
    autoBuildId? : number,      // auto_build 테이블 외래키
    buildType? : string,        // "MANUAL" | "AUTO"
    buildName : string,         // 완제품 이름
    includeAssembly : boolean   // 조립 대행 공임비 포함 여부
    partProductIds? : number[]      // 부품 구성 (상품 id 리스트)
    customDesignData? : string   // 커스텀 키캡 정보
}

export interface ProductList {
    product : ProductType;
}
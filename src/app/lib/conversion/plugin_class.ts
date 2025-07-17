export interface Product {
  product_id: number;
  name: string;
  description?: string;
  images?: string[];
  isPublished: boolean;
}

export interface ProductList {
  products: Product[];
}

export abstract class App {
  static registry: Record<string, new (app_id: string) => App> = {};

  static register(type: string, ctor: new (app_id: string) => App) {
    App.registry[type] = ctor;
  }

  protected app_id: string;

  constructor(app_id: string) {
    this.app_id = app_id;
  }

  abstract init(): Promise<void>;
  abstract getAllProducts(): Promise<ProductList>;
  abstract processProduct(product: unknown): Product;
  abstract updateProduct(productInfo: unknown): Promise<Product>;

  // Optional method for plugins that support fetching individual products
  getProductById?(productId: string): Promise<Product | null>;
}

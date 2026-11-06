// Generated from canonical ENEBINHA V2.1 + D7 handoff inventory (2026-11-06)

export type SupplierLogoAssetType = "supplier_logo" | "official_profile_avatar";
export type SupplierLogoAuditStatus = "verificado" | "pendente" | "bloqueado";

export interface SupplierLogoAudit {
  assetType: SupplierLogoAssetType;
  logoAssetLocal: string | null;
  logoSourceEvidence: string;
  status: SupplierLogoAuditStatus;
  notes: string;
  assetSha256: string | null;
  assetDimensions: string | null;
  usageProvenance: string;
}

export interface EnebinhaSupplierEntry {
  id: string;
  category: string;
  categorySlug: string;
  sourceTitle: string;
  title: string;
  url: string;
  platform: "Goofish" | "Yupoo" | "HubBuy" | "X" | "Externo";
  isStorefront: boolean;
  logoAudit: SupplierLogoAudit;
}

export interface EnebinhaSupplierCategory {
  slug: string;
  category: string;
  shortLabel: string;
  count: number;
  entries: EnebinhaSupplierEntry[];
}

export interface EnebinhaGuideEntry {
  id: string;
  sourceTitle: string;
  title: string;
  url: string;
  platform: string;
}

export interface EnebinhaCommunityEntry {
  id: string;
  sourceTitle: string;
  title: string;
  url: string;
  platform: string;
  subtitle: string;
}

export interface EnebinhaBrandReference {
  id: string;
  name: string;
  url: string;
  file: string;
  publicPath: string;
  bytes: number;
  sha256: string;
}

export const ENEBINHA_MASCOT = {
  publicPath: "/enebinha/mascote-original.webp",
  sourceUrl: "https://enebinha.netlify.app/images/identity/enebinha-importacao.webp",
  width: 780,
  height: 355,
  sha256: "487929fe8501456317095c37c8cafd808db8a8733ae64b85f07aa6013bf096bf",
  immutable: true,
  alt: "Mascote original ENEBINHA com caixa de importação e referências visuais"
} as const;

export const ENEBINHA_DISPLAY_COUNTS = {
  supplierEntries: 73,
  supplierViewResultsIncludingVitrine: 74,
  storefrontsIdentifiedWithinCatalog: 5,
  guides: 8,
  community: 6,
  homeViewResultsIncludingHubbuy: 15,
  totalDisplayedEntries: 89,
  referenceBrands: 20
} as const;

export const ENEBINHA_HUBBUY = {
  sourceTitle: "Cadastro HubBuy",
  title: "Cadastro HubBuy",
  headline: "Comece pela HubBuy",
  subtitleDesktop: "Plataforma de importação · Link de indicação",
  subtitleMobile: "Cadastro · Link de indicação",
  ctaLabel: "Acessar HubBuy",
  url: "https://www.hubbuy.com/signUp?utm_source=website&utm_medium=ambassador&utm_campaign=linksharing&inviteCode=65EAVN8o"
} as const;

export const ENEBINHA_VITRINE = {
  sourceTitle: "Vitrine",
  title: "Vitrine Enebinha",
  subtitle: "Catálogo do criador",
  ctaLabel: "Acessar",
  url: "https://outfitlit.com/@enebinha"
} as const;

export const ENEBINHA_SUPPLIER_CATEGORIES: EnebinhaSupplierCategory[] = [
  {
    "slug": "eletronicos-e-perifericos",
    "category": "Eletrônicos e periféricos",
    "shortLabel": "Eletrônicos",
    "count": 17,
    "entries": [
      {
        "id": "supplier-001",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Periféricos",
        "title": "Periféricos",
        "url": "https://www.goofish.com/personal?userId=2217553906964",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2217553906964",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-002",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Teclados",
        "title": "Teclados",
        "url": "https://www.goofish.com/personal?userId=2565451157",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2565451157",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-003",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Câmeras",
        "title": "Câmeras",
        "url": "https://www.goofish.com/personal?userId=144293078",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=144293078",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-004",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "GPU",
        "title": "GPU",
        "url": "https://www.goofish.com/personal?userId=2216234552100",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2216234552100",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-005",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Periféricos PC",
        "title": "Periféricos PC",
        "url": "https://www.goofish.com/personal?userId=2207576282831",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2207576282831",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-006",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Periféricos Razer",
        "title": "Periféricos Razer",
        "url": "https://www.goofish.com/personal?userId=2215764481076",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2215764481076",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-007",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Placa-mãe",
        "title": "Placa-mãe",
        "url": "https://www.goofish.com/personal?userId=2124649991",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2124649991",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-008",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Smart Watch",
        "title": "Smart Watch",
        "url": "https://www.goofish.com/personal?userId=1654586593",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=1654586593",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-009",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Steam Deck",
        "title": "Steam Deck",
        "url": "https://www.goofish.com/personal?userId=1796669585",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=1796669585",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-010",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Tablet",
        "title": "Tablet",
        "url": "https://www.goofish.com/personal?userId=2217137257557",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2217137257557",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-011",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Switch",
        "title": "Nintendo Switch",
        "url": "https://www.goofish.com/personal?userId=2214007628702",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2214007628702",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-012",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Notebook",
        "title": "Notebook",
        "url": "https://www.goofish.com/personal?userId=2216739033201",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2216739033201",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-013",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Monitor",
        "title": "Monitor",
        "url": "https://www.goofish.com/personal?userId=2214895245823",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2214895245823",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-014",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "iPhones",
        "title": "iPhones",
        "url": "https://www.goofish.com/personal?userId=391299371",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=391299371",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-015",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "Celulares Android",
        "title": "Celulares Android",
        "url": "https://www.goofish.com/personal?userId=420356490",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=420356490",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-016",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "iPads",
        "title": "iPads",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.183e2127UuGLUC&userId=2215109756778",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.183e2127UuGLUC&userId=2215109756778",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-017",
        "category": "Eletrônicos e periféricos",
        "categorySlug": "eletronicos-e-perifericos",
        "sourceTitle": "MacBook",
        "title": "MacBook",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.4d173da6UAnbU8&userId=3252814831",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.4d173da6UAnbU8&userId=3252814831",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      }
    ]
  },
  {
    "slug": "relogios-e-oculos",
    "category": "Relógios e óculos",
    "shortLabel": "Relógios",
    "count": 10,
    "entries": [
      {
        "id": "supplier-018",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Bones",
        "title": "Bonés",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.45353da6VDmhJC&userId=2218618228826",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.45353da6VDmhJC&userId=2218618228826",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-019",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Relógios variados",
        "title": "Relógios variados",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.738f3da6N30PGv&userId=689324702",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.738f3da6N30PGv&userId=689324702",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-020",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Little Whale",
        "title": "Little Whale",
        "url": "https://00123luxury.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://00123luxury.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-021",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Atlantis NO.1",
        "title": "Atlantis NO.1",
        "url": "https://atlantis001.x.yupoo.com/albums?page=1",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://atlantis001.x.yupoo.com/albums?page=1",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-022",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Garmin",
        "title": "Garmin",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.7eec3da615OCc7&userId=2208503680989",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.7eec3da615OCc7&userId=2208503680989",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-023",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "G-Shock e Casio",
        "title": "G-Shock e Casio",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.50d83da6iunOCg&userId=3914866962",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.50d83da6iunOCg&userId=3914866962",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-024",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Ray-Ban",
        "title": "Ray-Ban",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.67f13da6SCCvVG&userId=2207661288707",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.67f13da6SCCvVG&userId=2207661288707",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-025",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Óculos Oakley",
        "title": "Óculos Oakley",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.235b3da6JSNDOv&userId=2216696656177",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.235b3da6JSNDOv&userId=2216696656177",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-026",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Apple Watch",
        "title": "Apple Watch",
        "url": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.58d03da6JJrXa5&userId=3335270619",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?spm=a21ybx.item.itemHeader.1.58d03da6JJrXa5&userId=3335270619",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-027",
        "category": "Relógios e óculos",
        "categorySlug": "relogios-e-oculos",
        "sourceTitle": "Kipling",
        "title": "Kipling",
        "url": "https://x.com/enebinha/status/2054556808379847040?s=20",
        "platform": "X",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://x.com/enebinha/status/2054556808379847040?s=20",
          "status": "pendente",
          "notes": "Destino aponta para post/thread no X (Twitter) e nao para perfil/logo estatico de fornecedor. Solicitar definicao ou ativo oficial ao responsavel.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      }
    ]
  },
  {
    "slug": "roupas-e-moda",
    "category": "Roupas e moda",
    "shortLabel": "Roupas",
    "count": 17,
    "entries": [
      {
        "id": "supplier-028",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "ARTIEMASTER",
        "title": "ARTIEMASTER",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/BE9GaqRK",
        "platform": "HubBuy",
        "isStorefront": true,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/BE9GaqRK",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy sem logo ou avatar estatico publico entregue no handoff. Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-029",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "eSport",
        "title": "eSport",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/eLRG1JEB",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/eLRG1JEB",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy sem logo ou avatar estatico publico entregue no handoff. Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-030",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Husky Reps",
        "title": "Husky Reps",
        "url": "https://huskyreps.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": true,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://huskyreps.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-031",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Lemonvip",
        "title": "Lemonvip",
        "url": "https://lemonvip.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://lemonvip.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-032",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Angelking47",
        "title": "Angelking47",
        "url": "https://angelking47.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://angelking47.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-033",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "GOAT Official",
        "title": "GOAT Official",
        "url": "https://goat-official.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": true,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://goat-official.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-034",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Madebykungfu",
        "title": "Madebykungfu",
        "url": "https://madebykungfu.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://madebykungfu.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-035",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "French Fish Store",
        "title": "French Fish Store",
        "url": "https://kdi220.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://kdi220.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-036",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Black Mask",
        "title": "Black Mask",
        "url": "https://windvane168.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://windvane168.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-037",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Victoria Reps",
        "title": "Victoria Reps",
        "url": "https://victoria-reps.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://victoria-reps.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-038",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Taurus Reps",
        "title": "Taurus Reps",
        "url": "https://deateath.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://deateath.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-039",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "DragonRep",
        "title": "DragonRep",
        "url": "https://noghost.x.yupoo.com",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://noghost.x.yupoo.com",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-040",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "3125Tiger",
        "title": "3125Tiger",
        "url": "https://3125tiger.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://3125tiger.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-041",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "TigerRep",
        "title": "TigerRep",
        "url": "https://tiger-official.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://tiger-official.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-042",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Zara feminino",
        "title": "Zara feminino",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/3K8WZ7E1",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/3K8WZ7E1",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-043",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Zara masculino",
        "title": "Zara masculino",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/k4RrBZRB",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/k4RrBZRB",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-044",
        "category": "Roupas e moda",
        "categorySlug": "roupas-e-moda",
        "sourceTitle": "Calças Jeans (Levi's, Carhartt, Acne Studio etc.)",
        "title": "Calças Jeans (Levi's, Carhartt, Acne Studio)",
        "url": "https://www.hubbuy.com/shop/2/1701831725?&utm_source=website&utm_medium=share&utm_campaign=shop&inviteCode=65EAVN8o",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.hubbuy.com/shop/2/1701831725?&utm_source=website&utm_medium=share&utm_campaign=shop&inviteCode=65EAVN8o",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      }
    ]
  },
  {
    "slug": "tenis-e-calcados",
    "category": "Tênis e calçados",
    "shortLabel": "Tênis",
    "count": 6,
    "entries": [
      {
        "id": "supplier-045",
        "category": "Tênis e calçados",
        "categorySlug": "tenis-e-calcados",
        "sourceTitle": "WWTOP",
        "title": "WWTOP",
        "url": "https://wwfake100.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": true,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://wwfake100.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-046",
        "category": "Tênis e calçados",
        "categorySlug": "tenis-e-calcados",
        "sourceTitle": "Repsmaster",
        "title": "Repsmaster",
        "url": "https://repsmaster.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://repsmaster.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-047",
        "category": "Tênis e calçados",
        "categorySlug": "tenis-e-calcados",
        "sourceTitle": "Ovosneaker",
        "title": "Ovosneaker",
        "url": "https://ovosneaker.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://ovosneaker.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-048",
        "category": "Tênis e calçados",
        "categorySlug": "tenis-e-calcados",
        "sourceTitle": "JMDY",
        "title": "JMDY",
        "url": "https://tianjin-no1.x.yupoo.com",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://tianjin-no1.x.yupoo.com",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-049",
        "category": "Tênis e calçados",
        "categorySlug": "tenis-e-calcados",
        "sourceTitle": "PAI",
        "title": "PAI",
        "url": "https://pai-reps.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://pai-reps.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-050",
        "category": "Tênis e calçados",
        "categorySlug": "tenis-e-calcados",
        "sourceTitle": "100 REP",
        "title": "100 REP",
        "url": "https://100rep.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://100rep.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      }
    ]
  },
  {
    "slug": "esportes-e-camisas",
    "category": "Esportes e camisas",
    "shortLabel": "Esportes",
    "count": 10,
    "entries": [
      {
        "id": "supplier-051",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "Equipamentos e roupas de luta ORIGINAIS",
        "title": "Equipamentos e roupas de luta originais",
        "url": "https://www.goofish.com/personal?userId=2217045023426",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2217045023426",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-052",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "OKJersey",
        "title": "OKJersey",
        "url": "https://okjersey.x.yupoo.com",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://okjersey.x.yupoo.com",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-053",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "NFL",
        "title": "NFL",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/o38VBx8z",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/o38VBx8z",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-054",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "NHL, MLB etc.",
        "title": "NHL, MLB etc.",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/4NXbLj8o",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/4NXbLj8o",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-055",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "AAA Jersey",
        "title": "AAA Jersey",
        "url": "https://aaaajersey.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://aaaajersey.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-056",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "Roupas para esportes",
        "title": "Roupas para esportes",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/L7EjGA8g",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/L7EjGA8g",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy sem logo ou avatar estatico publico entregue no handoff. Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-057",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "Roupas de academia",
        "title": "Roupas de academia",
        "url": "https://t.co/fTgGTyhQjS",
        "platform": "X",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://t.co/fTgGTyhQjS",
          "status": "pendente",
          "notes": "Destino aponta para post/thread no X (Twitter) e nao para perfil/logo estatico de fornecedor. Solicitar definicao ou ativo oficial ao responsavel.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-058",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "Jersey-go — loja direto na HubBuy",
        "title": "Jersey-go — loja direto na HubBuy",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/3K8Ww781",
        "platform": "HubBuy",
        "isStorefront": true,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/3K8Ww781",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy sem logo ou avatar estatico publico entregue no handoff. Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-059",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "Jersey-go",
        "title": "Jersey-go",
        "url": "https://jersey-go.x.yupoo.com/albums",
        "platform": "Yupoo",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://jersey-go.x.yupoo.com/albums",
          "status": "pendente",
          "notes": "Catalogo Yupoo de vendedor nomeado; nenhum logo/avatar oficial foi entregue no ZIP de handoff nem consta no bundle original do site. Solicitar logo/avatar oficial da loja.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-060",
        "category": "Esportes e camisas",
        "categorySlug": "esportes-e-camisas",
        "sourceTitle": "Roupas de academia femininas",
        "title": "Roupas de academia femininas",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/k4Rrq78B",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/k4Rrq78B",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy sem logo ou avatar estatico publico entregue no handoff. Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      }
    ]
  },
  {
    "slug": "brinquedos-e-colecionaveis",
    "category": "Brinquedos e colecionáveis",
    "shortLabel": "Brinquedos",
    "count": 5,
    "entries": [
      {
        "id": "supplier-061",
        "category": "Brinquedos e colecionáveis",
        "categorySlug": "brinquedos-e-colecionaveis",
        "sourceTitle": "Funko",
        "title": "Funko",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/4NXb9jRo",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/4NXb9jRo",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-062",
        "category": "Brinquedos e colecionáveis",
        "categorySlug": "brinquedos-e-colecionaveis",
        "sourceTitle": "Hot Wheels",
        "title": "Hot Wheels",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/gP8g7z8B",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/gP8g7z8B",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-063",
        "category": "Brinquedos e colecionáveis",
        "categorySlug": "brinquedos-e-colecionaveis",
        "sourceTitle": "LEGO",
        "title": "LEGO",
        "url": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/PEZnQpEk",
        "platform": "HubBuy",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "supplier_logo",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://hubbuy-shorten-redirect-727446398583.us-central1.run.app/PEZnQpEk",
          "status": "pendente",
          "notes": "Link redirecionador/loja HubBuy com rotulo de marca de produto; proibido usar logo da marca fabricante como se fosse do vendedor (regra D7 3.1). Solicitar logo/avatar oficial do vendedor.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-064",
        "category": "Brinquedos e colecionáveis",
        "categorySlug": "brinquedos-e-colecionaveis",
        "sourceTitle": "Action Figure 2",
        "title": "Action Figure 2",
        "url": "https://www.goofish.com/personal?userId=2217679380261",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2217679380261",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-065",
        "category": "Brinquedos e colecionáveis",
        "categorySlug": "brinquedos-e-colecionaveis",
        "sourceTitle": "Action Figure",
        "title": "Action Figure",
        "url": "https://www.goofish.com/personal?userId=14649943",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=14649943",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      }
    ]
  },
  {
    "slug": "automotivos-e-pecas",
    "category": "Automotivos e peças",
    "shortLabel": "Automotivos",
    "count": 8,
    "entries": [
      {
        "id": "supplier-066",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Volantes",
        "title": "Volantes",
        "url": "https://www.goofish.com/personal?userId=2212918838631",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2212918838631",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-067",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Volante Mercedes",
        "title": "Volante Mercedes",
        "url": "https://www.goofish.com/personal?userId=3382262981",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=3382262981",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-068",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Volante Audi",
        "title": "Volante Audi",
        "url": "https://www.goofish.com/personal?userId=2212865316806",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2212865316806",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/anti-bot); rotulo cita marca de produto/fabricante que nao pode ser atribuida ao vendedor (regra D7 3.1). Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-069",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Peças 3",
        "title": "Peças 3",
        "url": "https://www.goofish.com/personal?userId=2216561930127",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2216561930127",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-070",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Peças 2",
        "title": "Peças 2",
        "url": "https://www.goofish.com/personal?userId=819751940",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=819751940",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-071",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Peças 1",
        "title": "Peças 1",
        "url": "https://www.goofish.com/personal?userId=2964122225",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=2964122225",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-072",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Miniaturas",
        "title": "Miniaturas",
        "url": "https://www.goofish.com/personal?userId=1021653808",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=1021653808",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      },
      {
        "id": "supplier-073",
        "category": "Automotivos e peças",
        "categorySlug": "automotivos-e-pecas",
        "sourceTitle": "Rodas",
        "title": "Rodas",
        "url": "https://www.goofish.com/personal?userId=4189278061",
        "platform": "Goofish",
        "isStorefront": false,
        "logoAudit": {
          "assetType": "official_profile_avatar",
          "logoAssetLocal": null,
          "logoSourceEvidence": "https://www.goofish.com/personal?userId=4189278061",
          "status": "bloqueado",
          "notes": "Perfil pessoal de vendedor no Goofish (exige login/verificacao anti-bot para inspecionar avatar da conta); sem logo no pacote original. Solicitar avatar oficial da conta.",
          "assetSha256": null,
          "assetDimensions": null,
          "usageProvenance": "PENDENTE DE ATIVO — aguardando arquivo oficial do fornecedor/avatar pelo cliente"
        }
      }
    ]
  }
];

export const ENEBINHA_SUPPLIERS: EnebinhaSupplierEntry[] =
  ENEBINHA_SUPPLIER_CATEGORIES.flatMap((category) => category.entries);

export const ENEBINHA_MARQUEE_PRIORITY_IDS: readonly string[] = [
  "supplier-030",
  "supplier-033",
  "supplier-017",
  "supplier-045",
  "supplier-028",
  "supplier-022",
  "supplier-059",
  "supplier-014",
  "supplier-024",
  "supplier-062",
  "supplier-049",
  "supplier-041"
];

export const ENEBINHA_MARQUEE_SUPPLIERS: EnebinhaSupplierEntry[] = (() => {
  const byId = new Map(ENEBINHA_SUPPLIERS.map((entry) => [entry.id, entry]));
  const prioritized: EnebinhaSupplierEntry[] = [];
  const seen = new Set<string>();

  for (const id of ENEBINHA_MARQUEE_PRIORITY_IDS) {
    const item = byId.get(id);
    if (item && !seen.has(item.id)) {
      prioritized.push(item);
      seen.add(item.id);
    }
  }

  for (const entry of ENEBINHA_SUPPLIERS) {
    if (!seen.has(entry.id)) {
      prioritized.push(entry);
      seen.add(entry.id);
    }
  }

  return prioritized;
})();

export const ENEBINHA_GUIDES: EnebinhaGuideEntry[] = [
  {
    "id": "guide-01",
    "sourceTitle": "Tutorial completo",
    "title": "Tutorial completo",
    "url": "https://drive.google.com/drive/folders/1tdvya-fgOb8Fj10q02QQYP8KSXxM2LZU?usp=drive_link",
    "platform": "Google Drive"
  },
  {
    "id": "guide-02",
    "sourceTitle": "Tutorial resumido",
    "title": "Tutorial resumido",
    "url": "https://x.com/enebinha/status/2038451054631633411?s=20",
    "platform": "X · Thread"
  },
  {
    "id": "guide-03",
    "sourceTitle": "Tutorial de envio resumido",
    "title": "Tutorial de envio resumido",
    "url": "https://x.com/enebinha/status/2058293615357522017?s=20",
    "platform": "X · Thread"
  },
  {
    "id": "guide-04",
    "sourceTitle": "Tutorial vitrine",
    "title": "Tutorial vitrine",
    "url": "https://x.com/enebinha/status/2062625778441797750?s=20",
    "platform": "X · Thread"
  },
  {
    "id": "guide-05",
    "sourceTitle": "Tutorial busca por imagem",
    "title": "Tutorial busca por imagem",
    "url": "https://x.com/enebinha/status/2079194784376541231?s=20",
    "platform": "X · Thread"
  },
  {
    "id": "guide-06",
    "sourceTitle": "Tutorial vendedor de Nike e Adidas",
    "title": "Tutorial vendedor Nike e Adidas",
    "url": "https://x.com/enebinha/status/2059980930387788281?s=20",
    "platform": "X · Thread"
  },
  {
    "id": "guide-07",
    "sourceTitle": "Guia de Batchs",
    "title": "Guia de Batchs",
    "url": "https://docs.google.com/spreadsheets/d/14Ksjfyoyp5shX1AWYah-OIF_i6wCtcH6/edit?usp=sharing&ouid=107008292719172340429&rtpof=true&sd=true",
    "platform": "Google Sheets"
  },
  {
    "id": "guide-08",
    "sourceTitle": "Tutorial 1:1 Shopee",
    "title": "Tutorial 1:1 Shopee",
    "url": "https://x.com/enebinha/status/2082104052620603713",
    "platform": "X · Thread"
  }
];

export const ENEBINHA_COMMUNITY: EnebinhaCommunityEntry[] = [
  {
    "id": "community-01",
    "sourceTitle": "TikTok",
    "title": "TikTok",
    "url": "https://tiktok.com/@enebinha",
    "platform": "TikTok",
    "subtitle": "Vídeos e achados (@enebinha)"
  },
  {
    "id": "community-02",
    "sourceTitle": "Instagram",
    "title": "Instagram",
    "url": "https://instagram.com/enebinha",
    "platform": "Instagram",
    "subtitle": "Conteúdo e stories (@enebinha)"
  },
  {
    "id": "community-03",
    "sourceTitle": "X",
    "title": "X",
    "url": "https://twitter.com/enebinha",
    "platform": "X",
    "subtitle": "Threads, links e avisos (@enebinha)"
  },
  {
    "id": "community-04",
    "sourceTitle": "Amazon",
    "title": "Amazon",
    "url": "https://amzn.to/43i5FXE",
    "platform": "Amazon",
    "subtitle": "Seleção e recomendações"
  },
  {
    "id": "community-05",
    "sourceTitle": "Telegram",
    "title": "Telegram",
    "url": "https://t.me/c/3878286132/1",
    "platform": "Telegram",
    "subtitle": "Canal de links e avisos"
  },
  {
    "id": "community-06",
    "sourceTitle": "Grupo ENEBINHA ¦ HUBBUY",
    "title": "ENEBINHA HUBBUY",
    "url": "https://t.me/enebinhacn",
    "platform": "Telegram",
    "subtitle": "Comunidade no Telegram"
  }
];

export const ENEBINHA_BRAND_REFERENCES: EnebinhaBrandReference[] = [
  {
    "id": "brand-01",
    "name": "Nike",
    "url": "https://enebinha.netlify.app/images/logos/editorial/nike.svg",
    "file": "marcas-originais/nike.svg",
    "publicPath": "/enebinha/marcas-originais/nike.svg",
    "bytes": 415,
    "sha256": "fd0ddc746210644f055d6c42d472dcce6cc1ea80956144f3bcefab382cb72df2"
  },
  {
    "id": "brand-02",
    "name": "Adidas",
    "url": "https://enebinha.netlify.app/images/logos/editorial/adidas.svg",
    "file": "marcas-originais/adidas.svg",
    "publicPath": "/enebinha/marcas-originais/adidas.svg",
    "bytes": 264,
    "sha256": "3b492374e3ff9a3dff753df5a6e1857e16e18fbd58924d4088cff7048427932f"
  },
  {
    "id": "brand-03",
    "name": "Jordan",
    "url": "https://enebinha.netlify.app/images/logos/editorial/jordan.svg",
    "file": "marcas-originais/jordan.svg",
    "publicPath": "/enebinha/marcas-originais/jordan.svg",
    "bytes": 3170,
    "sha256": "68f177a6b85c2e496f8abf3e81f66da86fdec9abe13be39de15e7a0a231e6b6c"
  },
  {
    "id": "brand-04",
    "name": "Supreme",
    "url": "https://enebinha.netlify.app/images/logos/editorial/supreme.svg",
    "file": "marcas-originais/supreme.svg",
    "publicPath": "/enebinha/marcas-originais/supreme.svg",
    "bytes": 2329,
    "sha256": "333c51ebbe0d502ec739619139b90d4f95d033c206054315acaee14a8eb1fcea"
  },
  {
    "id": "brand-05",
    "name": "Stüssy",
    "url": "https://enebinha.netlify.app/images/logos/editorial/stussy.svg",
    "file": "marcas-originais/stussy.svg",
    "publicPath": "/enebinha/marcas-originais/stussy.svg",
    "bytes": 21807,
    "sha256": "b6f8206e54a3234e53cd05158fdc4e024771d126637f4138e0607e962d0b159d"
  },
  {
    "id": "brand-06",
    "name": "Carhartt",
    "url": "https://enebinha.netlify.app/images/logos/editorial/carhartt.svg",
    "file": "marcas-originais/carhartt.svg",
    "publicPath": "/enebinha/marcas-originais/carhartt.svg",
    "bytes": 11381,
    "sha256": "cae0983c441733d61048252a99186ef3c9569eee9b3e33882296e308bb7378b7"
  },
  {
    "id": "brand-07",
    "name": "New Balance",
    "url": "https://enebinha.netlify.app/images/logos/editorial/newbalance.svg",
    "file": "marcas-originais/newbalance.svg",
    "publicPath": "/enebinha/marcas-originais/newbalance.svg",
    "bytes": 865,
    "sha256": "fff9f083d6c14ee42745367714864c061e8c84d175deb61d05151671451e77be"
  },
  {
    "id": "brand-08",
    "name": "Puma",
    "url": "https://enebinha.netlify.app/images/logos/editorial/puma.svg",
    "file": "marcas-originais/puma.svg",
    "publicPath": "/enebinha/marcas-originais/puma.svg",
    "bytes": 1391,
    "sha256": "bd0ec09cd2147f19400bcfd33de2f32cf11745adccb145670ba6053523035a32"
  },
  {
    "id": "brand-09",
    "name": "The North Face",
    "url": "https://enebinha.netlify.app/images/logos/editorial/thenorthface.svg",
    "file": "marcas-originais/thenorthface.svg",
    "publicPath": "/enebinha/marcas-originais/thenorthface.svg",
    "bytes": 2139,
    "sha256": "d8e80ffe73b8ca692469d7708494b35b14f3ecd821704bd6e222a47e7bb53eba"
  },
  {
    "id": "brand-10",
    "name": "Palace",
    "url": "https://enebinha.netlify.app/images/logos/editorial/palace.webp",
    "file": "marcas-originais/palace.webp",
    "publicPath": "/enebinha/marcas-originais/palace.webp",
    "bytes": 16284,
    "sha256": "d07e617ba99d173285999ee307b57115f5abd5379a1fad86dad0753e84c67845"
  },
  {
    "id": "brand-11",
    "name": "Louis Vuitton",
    "url": "https://enebinha.netlify.app/images/logos/editorial/louisvuitton.svg",
    "file": "marcas-originais/louisvuitton.svg",
    "publicPath": "/enebinha/marcas-originais/louisvuitton.svg",
    "bytes": 8990,
    "sha256": "a9d8dfd04b55383b2fe95fd7d5d61e2e427ab64c0a233b6f37bba4f121281639"
  },
  {
    "id": "brand-12",
    "name": "Gucci",
    "url": "https://enebinha.netlify.app/images/logos/editorial/gucci.svg",
    "file": "marcas-originais/gucci.svg",
    "publicPath": "/enebinha/marcas-originais/gucci.svg",
    "bytes": 3989,
    "sha256": "53f6a5e9b427b0c868f996ea7909d5e6af74ceb6b8fe9cfd3a18f0cf41d0c954"
  },
  {
    "id": "brand-13",
    "name": "Prada",
    "url": "https://enebinha.netlify.app/images/logos/editorial/prada.svg",
    "file": "marcas-originais/prada.svg",
    "publicPath": "/enebinha/marcas-originais/prada.svg",
    "bytes": 2867,
    "sha256": "f2662ba6986c5be3ddf129bf48990314ef4330666f919215243371b0c2cb5aee"
  },
  {
    "id": "brand-14",
    "name": "Dior",
    "url": "https://enebinha.netlify.app/images/logos/editorial/dior.svg",
    "file": "marcas-originais/dior.svg",
    "publicPath": "/enebinha/marcas-originais/dior.svg",
    "bytes": 2066,
    "sha256": "dd4bad6f9b663c39e93be488368147dbfd9fa8b90eddf6d802c8d1ff694d0b08"
  },
  {
    "id": "brand-15",
    "name": "Balenciaga",
    "url": "https://enebinha.netlify.app/images/logos/editorial/balenciaga.svg",
    "file": "marcas-originais/balenciaga.svg",
    "publicPath": "/enebinha/marcas-originais/balenciaga.svg",
    "bytes": 1912,
    "sha256": "d64c402c61f3288c9c83e1ef01cffafc57ab9ee72538ad249655990753b53dfe"
  },
  {
    "id": "brand-16",
    "name": "Apple",
    "url": "https://enebinha.netlify.app/images/logos/editorial/apple.svg",
    "file": "marcas-originais/apple.svg",
    "publicPath": "/enebinha/marcas-originais/apple.svg",
    "bytes": 671,
    "sha256": "e58dd0a4f57138a51a103469959d343cd82208d33194324f1897abdd1bb52831"
  },
  {
    "id": "brand-17",
    "name": "Sony",
    "url": "https://enebinha.netlify.app/images/logos/editorial/sony.svg",
    "file": "marcas-originais/sony.svg",
    "publicPath": "/enebinha/marcas-originais/sony.svg",
    "bytes": 2765,
    "sha256": "02983d28b7fd2f7be3a1069148e61e53a926d5c71c9d7c85be82c9b0ac1b0df7"
  },
  {
    "id": "brand-18",
    "name": "Samsung",
    "url": "https://enebinha.netlify.app/images/logos/editorial/samsung.svg",
    "file": "marcas-originais/samsung.svg",
    "publicPath": "/enebinha/marcas-originais/samsung.svg",
    "bytes": 2307,
    "sha256": "12c46b4b73d8e3f236c83a28e9da2dab86461697e6249911a06f85cb48284ced"
  },
  {
    "id": "brand-19",
    "name": "Logitech",
    "url": "https://enebinha.netlify.app/images/logos/editorial/logitech.svg",
    "file": "marcas-originais/logitech.svg",
    "publicPath": "/enebinha/marcas-originais/logitech.svg",
    "bytes": 6656,
    "sha256": "fb015402a4d717c5af7c67cff1adbeec042a3725aee18202a783b0bf0b5215a3"
  },
  {
    "id": "brand-20",
    "name": "Razer",
    "url": "https://enebinha.netlify.app/images/logos/editorial/razer.svg",
    "file": "marcas-originais/razer.svg",
    "publicPath": "/enebinha/marcas-originais/razer.svg",
    "bytes": 7221,
    "sha256": "8a7cd9e72f9361c1a66628c6723bdbd3ced73635136a5d777384f6a9a39a0024"
  }
];

export const ENEBINHA_DISCLOSURES = {
  catalogDisclaimer:
    "Links de referência. A presença no catálogo não confirma disponibilidade ou atividade do fornecedor.",
  brandReferenceDisclaimer:
    "Marcas apresentadas como referências de produtos. Não indicam parceria ou afiliação oficial com o ENEBINHA.",
  hubBuyReferralDisclaimer: "Cadastro HubBuy é um link de indicação.",
  upcomingNotice:
    "Links e conteúdos novos em breve — acompanhe nas redes para atualizações.",
  footerCopyright: "© 2026 ENEBINHA · Feito para conectar",
  footerAttribution: "Disponibilizado pelo Loti"
} as const;

export function normalizeEnebinhaSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesSupplierQuery(entry: EnebinhaSupplierEntry, query: string): boolean {
  const normalized = normalizeEnebinhaSearch(query);
  if (!normalized) return true;
  const haystack = normalizeEnebinhaSearch(
    `${entry.title} ${entry.sourceTitle} ${entry.category} ${entry.platform}`
  );
  return haystack.includes(normalized);
}

export function filterSupplierCategories(options: {
  categorySlug: string | "all";
  query: string;
}): EnebinhaSupplierCategory[] {
  const { categorySlug, query } = options;
  return ENEBINHA_SUPPLIER_CATEGORIES.filter((cat) =>
    categorySlug === "all" ? true : cat.slug === categorySlug
  )
    .map((cat) => {
      const entries = cat.entries.filter((entry) => matchesSupplierQuery(entry, query));
      return {
        ...cat,
        entries
      };
    })
    .filter((cat) => cat.entries.length > 0);
}

export function filterGuides(query: string): EnebinhaGuideEntry[] {
  const normalized = normalizeEnebinhaSearch(query);
  if (!normalized) return ENEBINHA_GUIDES;
  return ENEBINHA_GUIDES.filter((entry) =>
    normalizeEnebinhaSearch(`${entry.title} ${entry.sourceTitle} ${entry.platform}`).includes(
      normalized
    )
  );
}

export function filterCommunity(query: string): EnebinhaCommunityEntry[] {
  const normalized = normalizeEnebinhaSearch(query);
  if (!normalized) return ENEBINHA_COMMUNITY;
  return ENEBINHA_COMMUNITY.filter((entry) =>
    normalizeEnebinhaSearch(
      `${entry.title} ${entry.sourceTitle} ${entry.platform} ${entry.subtitle}`
    ).includes(normalized)
  );
}

export function getSupplierLogoAuditSummary() {
  let verified = 0;
  let pending = 0;
  let blocked = 0;

  for (const supplier of ENEBINHA_SUPPLIERS) {
    if (supplier.logoAudit.status === "verificado" && supplier.logoAudit.logoAssetLocal) {
      verified++;
    } else if (supplier.logoAudit.status === "bloqueado") {
      blocked++;
    } else {
      pending++;
    }
  }

  return {
    total: ENEBINHA_SUPPLIERS.length,
    verified,
    pending,
    blocked,
    unresolved: pending + blocked,
    isD7Finalized: verified === ENEBINHA_SUPPLIERS.length
  };
}

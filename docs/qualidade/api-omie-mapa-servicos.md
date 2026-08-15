# API Omie — mapa completo dos serviços

Levantado em 13/08/2026 no Portal do Desenvolvedor (`developer.omie.com.br/service-list/`).
**148 serviços** em 7 módulos.

**Base:** `https://app.omie.com.br/api/v1/`
Todas as chamadas são **POST** — a Omie não suporta GET. Formatos: JSON ou SOAP.

Os endpoints marcados com ● são os que o projeto usa ou deveria usar.

---

## Compras, Estoque e Produção — 36 serviços

O módulo central do projeto.

| Serviço | Endpoint | |
|---|---|---|
| Produtos | `geral/produtos/` | ● |
| Produtos - Características | `geral/prodcaract/` | |
| **Produtos - Estrutura** | `geral/malha/` | ● ficha técnica |
| Produtos - Kit | `geral/produtoskit/` | |
| Produtos - Variação | `produtos/variacao/` | |
| Produtos - Lote | `produtos/produtoslote/` | desativado por decisão |
| Requisições de Compra | `produtos/requisicaocompra/` | |
| Pedidos de Compra | `produtos/pedidocompra/` | |
| **Ordens de Produção** | `produtos/op/` | ● |
| Nota de Entrada | `produtos/notaentrada/` | |
| Nota de Entrada - Faturamento | `produtos/notaentradafat/` | |
| Recebimento de Nota Fiscal | `produtos/recebimentonfe/` | |
| Resumo de compras | `produtos/compras-resumo/` | |

### Estoque

| Serviço | Endpoint | |
|---|---|---|
| Ajustes de Estoque | `estoque/ajuste/` | ● perdas e quebras |
| **Consulta Estoque** | `estoque/consulta/` | ● `PosicaoEstoque` |
| **Movimento Estoque** | `estoque/movestoque/` | ● OPE/28, produção real |
| Locais de Estoque | `estoque/local/` | ● CD-DÊVI, almoxarifado |
| Resumo do Estoque | `estoque/resumo/` | |

### Cadastros auxiliares

`geral/familias/` · `geral/unidade/` · `estoque/comprador/` ·
`estoque/produtofornecedor/` · `produtos/formaspagcompras/` ·
`produtos/ncm/` · `geral/cenarios/`

### Impostos

`produtos/cfop/` · `produtos/cnae/` · `produtos/icmscst/` · `produtos/icmscsosn/` ·
`produtos/icmsorigem/` · `produtos/piscst/` · `produtos/cofinscst/` ·
`produtos/ipicst/` · `produtos/ipienq/` · `produtos/tpcalc/` · `produtos/cest/`

---

## Geral — 17 serviços

| Serviço | Endpoint | |
|---|---|---|
| Clientes, Fornecedores, Transportadoras | `geral/clientes/` | ● nome na fila |
| Clientes - Características | `geral/clientescaract/` | |
| Tags | `geral/clientetag/` | |
| Projetos | `geral/projetos/` | |

### Cadastros auxiliares

| Serviço | Endpoint | |
|---|---|---|
| Empresas | `geral/empresas/` | |
| Departamentos | `geral/departamentos/` | |
| Categorias | `geral/categorias/` | |
| Parcelas | `geral/parcelas/` | |
| Tipos de Atividade | `geral/tpativ/` | |
| CNAE | `produtos/cnae/` | |
| Cidades | `geral/cidades/` | |
| Países | `geral/paises/` | |
| Tipos de Anexos | `geral/tiposanexo/` | categorias de anexo |
| **Documentos Anexos** | `geral/anexo/` | ● PDF da ficha |
| Tipo de Entrega | `geral/tiposentrega/` | |
| Tipo de Assinante | `geral/tipoassinante/` | |
| Tarefas | `geral/tarefas/` | |

---

## Vendas e NF-e — 32 serviços

| Serviço | Endpoint | |
|---|---|---|
| Pedidos de Venda - Resumido | `produtos/pedidovenda/` | |
| **Pedidos de Venda** | `produtos/pedido/` | ● fila e demanda |
| Pedidos de Venda - Faturamento | `produtos/pedidovendafat/` | |
| **Pedidos de Venda - Etapas** | `produtos/pedidoetapas/` | ● etapa "A faturar" |
| CT-e / CT-e OS | `produtos/cte/` | |
| Remessa de Produtos | `produtos/remessa/` | |
| Remessa - Faturamento | `produtos/remessafat/` | |
| Resumo de vendas | `produtos/vendas-resumo/` | |
| Obter Documentos | `produtos/dfedocs/` | PDF e XML fiscais |

### Cupom fiscal

`produtos/cupomfiscalincluir/` · `produtos/cupomfiscal/` ·
`produtos/cupomfiscalconsultar/` · `produtos/nfce/` · `produtos/sat/`

### NF-e

`produtos/nfconsultar/` · `produtos/notafiscalutil/` · `produtos/nfe/`

### Cadastros auxiliares

`geral/vendedores/` · `produtos/formaspagvendas/` · `produtos/tabelaprecos/` ·
`geral/caracteristicas/` · `produtos/etapafat/` · `geral/meiospagamento/` ·
`geral/origempedido/` · `geral/motivodevolucao/`

---

## Finanças — 18 serviços

| Serviço | Endpoint |
|---|---|
| Contas Correntes | `geral/contacorrente/` |
| Contas Correntes - Lançamentos | `financas/contacorrentelancamentos/` |
| Contas a Pagar | `financas/contapagar/` |
| Contas a Receber | `financas/contareceber/` |
| Contas a Receber - Boletos | `financas/contareceberboleto/` |
| Contas a Receber - PIX | `financas/pix/` |
| Extrato de Conta Corrente | `financas/extrato/` |
| Orçamento de Caixa | `financas/caixa/` |
| Pesquisar Títulos | `financas/pesquisartitulos/` |
| Movimentos Financeiros | `financas/mf/` |
| Resumo | `financas/resumo/` |

Auxiliares: `geral/bancos/` · `geral/tiposdoc/` · `geral/tipocc/` ·
`geral/dre/` · `geral/finaltransf/` · `geral/origemlancamento/` · bandeiras de cartão

---

## CRM — 22 serviços

Contas, contatos, oportunidades e tarefas. Não usado no projeto.

`crm/contas/` e derivados, mais 14 cadastros auxiliares (soluções, fases,
usuários, status, motivos, tipos, parceiros, finders, origens, concorrentes,
verticais, vendedores, telemarketing, pré-vendas).

---

## Serviços e NFS-e — 21 serviços

Ordens de serviço, contratos e emissão de NFS-e. Não usado no projeto.

---

## Painel do Contador — 2 serviços

Documentos fiscais e resumo de fechamento contábil.

---

## Serviços que valem avaliar

Levantados na varredura, ainda não usados:

### `estoque/ajuste/` — Ajustes de Estoque
*"Cria/exclui movimentações do estoque"*

É onde ficam registradas **perdas, quebras e ajustes de inventário**. Foi o caminho
investigado para o KPI de perda de latas que ficou em aberto.

### `estoque/resumo/` — Resumo do Estoque
Resumo consolidado por produto. Pode substituir chamadas individuais de
`PosicaoEstoque`, que hoje são 38 por ciclo para os insumos. **Vale testar
se funciona para matéria-prima** — o `ListarPosEstoque` não funciona.

### `produtos/dfedocs/` — Obter Documentos
Disponibiliza PDF e XML de documentos fiscais. Não serve para a ficha de qualidade,
mas resolve se algum dia for preciso anexar nota ao pedido.

### `geral/malha/` — Produtos - Estrutura
Já usado para a explosão de insumos. Vale lembrar que, para a **tela de insumos da OP**,
a fonte correta é `ConsultarOrdemProducao` (`itensDetalhes`), não a malha —
porque itens podem ser ajustados pontualmente na OP.

---

## Observações de uso

**Só POST.** A Omie não suporta consumo via GET.

**Paginação.** Métodos de listagem são paginados. O retorno traz `pagina`,
`total_de_paginas`, `registros` e `total_de_registros`.

**Rate limit.** Manter o backoff exponencial já implementado para HTTP 429.

**Anexos precisam de zip.** O campo `cArquivo` do `IncluirAnexo` exige o conteúdo
compactado em zip e depois convertido em base64 — não apenas base64.

**`cTabela` não é documentado.** A lista de valores aceitos não consta na página do
serviço de anexos. Descobrir anexando um arquivo pela interface e consultando
`ListarAnexo` pelo `nId`.

# Segurança

O Day UP guarda dados pessoais (e-mail, rotina e notas). Se você encontrar uma vulnerabilidade, avise por um canal privado.

## Como reportar

Use o **[reporte privado de vulnerabilidades do GitHub](../../security/advisories/new)** deste repositório. Não abra issue pública com detalhes de uma falha.

Se possível, descreva o problema, como reproduzir e o impacto. Costumo responder em poucos dias.

## Escopo

- A aplicação em produção (`dayup.biigstudio.com.br`) e o código deste repositório.
- Fora do escopo: ataques de negação de serviço volumétricos, engenharia social e testes que alterem dados de outros usuários. A conta demo pública é compartilhada e é restaurada todas as noites.

## O que já existe

Um resumo das proteções implementadas (sessões no servidor, CSRF, rate limiting, cabeçalhos de segurança, etc.) está na seção **Segurança** do [README](README.md).

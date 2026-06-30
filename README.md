# Editor-de-cena---Jardim-das-luas
Trabalho da disciplina de Computação Gráfica - Editor de cena 3D
# Projeto de Computação Gráfica: Editor de Cena 3D WebGL

## Descrição
Este projeto consiste num editor de cenas 3D interativo desenvolvido em JavaScript e WebGL. O trabalho foi concebido para demonstrar a aplicação prática de conceitos fundamentais de renderização gráfica, manipulação de matrizes e gestão de estado de objetos tridimensionais diretamente no navegador.


O sistema cumpre os seguintes requisitos da disciplina:

* Carregamento de Modelos 3D: Importação de ficheiros .obj e .mtl, com instanciação dinâmica na cena para otimização de memória.
* Transformações Geométricas: Controlo independente de Translação, Rotação e Escala de cada modelo selecionado através da interface.
* Sistema de Hierarquia (Grafo de Cena): Implementação de relação "Pai/Filho" entre instâncias. A matriz de transformação local dos objetos "filhos" é multiplicada pela matriz do "pai", permitindo herança de movimento.
* Animação Contínua: Desenvolvimento de um loop de renderização utilizando `requestAnimationFrame` e cálculo de Delta Time para garantir animações suaves e independentes do hardware.
* Troca Dinâmica de Texturas: Substituição de materiais e texturas em tempo de execução para instâncias específicas, sem afetar o modelo original.
* Matrizes de Projeção: Alternância em tempo real entre projeções Perspetiva e Ortográfica.
* Persistência de Estado: Funcionalidade de guardar (exportar) e carregar (importar) a configuração completa da cena através de ficheiros JSON.

## Estrutura de Ficheiros
* index.html: Estrutura da interface de utilizador (UI) e definição do canvas.
* style.css: Estilização visual da interface.
* trabalho.js: Motor principal da aplicação. Contém o pipeline do WebGL, o cálculo de matrizes matemáticas, as chamadas de desenho e o controlador de eventos.
* /objetos: Diretório que armazena os modelos geométricos e as imagens de textura utilizadas.

## Referências
As bibliotecas de auxílio matemático (m4.js e twgl.js), bem como a base lógica para o parsing dos ficheiros .obj e .mtl, foram adaptadas da documentação técnica recomendada: WebGL2Fundamentals. A arquitetura global do editor, o sistema de instanciamento, hierarquias e lógica de interface foram desenvolvidos especificamente para este trabalho.

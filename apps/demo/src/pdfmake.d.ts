// pdfmake 0.3 ships no type declarations; the API used is typed by the library's PdfmakeInstance.
declare module 'pdfmake/build/pdfmake' {
  const pdfmake: unknown
  export default pdfmake
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>
  export default vfs
}
